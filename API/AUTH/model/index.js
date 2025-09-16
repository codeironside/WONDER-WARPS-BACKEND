import mongoose from "mongoose";
import bcrypt from "bcrypt";
import ErrorHandler from "../../../CORE/middleware/errorhandler/index.js";
import RoleModel from "../../ROLES/model/index.js";

const SALT_ROUNDS = 10;

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    phonenumber: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: Number, required: true, ref: "roles" },
    lastLogin: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  }
  next();
});

userSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

userSchema.statics.findUser = async function (identifier) {
  return this.findOne({
    $or: [
      { email: identifier },
      { username: identifier },
      { phonenumber: identifier },
    ],
  });
};

userSchema.statics.signIn = async function (identifier, password) {
  const user = await this.findUser(identifier);
  if (user && (await user.comparePassword(password))) {
    // Update last login timestamp
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });
    return user;
  }
  return null;
};

userSchema.statics.createUser = async function (userData) {
  const existingUser = await this.findOne({
    $or: [
      { email: userData.email },
      { username: userData.userName },
      { phonenumber: userData.phoneNumber },
    ],
  });
  if (existingUser) {
    if (existingUser.email === userData.email) {
      throw new ErrorHandler("Email is already in use.", 406);
    }
    if (existingUser.username === userData.userName) {
      throw new ErrorHandler("Username is already in use.", 406);
    }
    if (existingUser.phonenumber === userData.phoneNumber) {
      throw new ErrorHandler("Phone number is already in use.", 406);
    }
  }
  const getRoleId = await RoleModel.getRoleName(userData.role);
  const newUser = new this({
    email: userData.email,
    username: userData.userName,
    firstname: userData.firstName,
    lastname: userData.lastName,
    phonenumber: userData.phoneNumber,
    password: userData.password,
    role: getRoleId,
  });
  await newUser.save();
  return {
    email: newUser.email,
    username: newUser.username,
    firstname: newUser.firstname,
    lastname: newUser.lastname,
    phonenumber: newUser.phonenumber,
  };
};

// Admin Dashboard Statistics Methods
userSchema.statics.getDashboardStats = async function () {
  try {
    // Get all statistics in parallel for better performance
    const [
      userStats,
      bookTemplateStats,
      personalizedBookStats,
      paymentStats,
      roles,
      genreStats,
      recentActivities,
    ] = await Promise.all([
      this.getUserStatistics(),
      this.getBookTemplateStatistics(),
      this.getPersonalizedBookStatistics(),
      this.getPaymentStatistics(),
      this.getAllRoles(),
      this.getGenreStatistics(),
      this.getRecentActivities(),
    ]);

    return {
      user_stats: userStats,
      book_template_stats: bookTemplateStats,
      personalized_book_stats: personalizedBookStats,
      payment_stats: paymentStats,
      roles: roles,
      genre_stats: genreStats,
      recent_activities: recentActivities,
    };
  } catch (error) {
    console.log(error);
    throw new ErrorHandler("Failed to fetch dashboard statistics", 500);
  }
};

userSchema.statics.getUserStatistics = async function () {
  try {
    const totalUsers = await this.countDocuments();

    // Get users by role
    const usersByRole = await this.aggregate([
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "roles",
          localField: "_id",
          foreignField: "role_id",
          as: "role_info",
        },
      },
      {
        $unwind: "$role_info",
      },
      {
        $project: {
          role_name: "$role_info.role_name",
          count: 1,
          _id: 0,
        },
      },
    ]);

    // Get new users in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const newUsers = await this.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
    });

    // Get active users (logged in within last 30 days)
    const activeUsers = await this.countDocuments({
      lastLogin: { $gte: thirtyDaysAgo },
    });

    return {
      total_users: totalUsers,
      users_by_role: usersByRole,
      new_users_last_30_days: newUsers,
      active_users_last_30_days: activeUsers,
    };
  } catch (error) {
    throw new ErrorHandler("Failed to fetch user statistics", 500);
  }
};

userSchema.statics.getBookTemplateStatistics = async function () {
  try {
    // Get the actual Mongoose model for BookTemplate
    const BookTemplateModel = mongoose.model("BookTemplate");

    const totalTemplates = await BookTemplateModel.countDocuments();

    const publicTemplates = await BookTemplateModel.countDocuments({
      is_public: true,
    });

    const privateTemplates = await BookTemplateModel.countDocuments({
      is_public: false,
    });

    const personalizedTemplates = await BookTemplateModel.countDocuments({
      is_personalizable: true,
    });

    // Templates by genre
    const templatesByGenre = await BookTemplateModel.aggregate([
      {
        $group: {
          _id: "$genre",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          genre: "$_id",
          count: 1,
          _id: 0,
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    // Average price of templates
    const priceStats = await BookTemplateModel.aggregate([
      {
        $group: {
          _id: null,
          avg_price: { $avg: "$price" },
          min_price: { $min: "$price" },
          max_price: { $max: "$price" },
        },
      },
    ]);

    return {
      total_templates: totalTemplates,
      public_templates: publicTemplates,
      private_templates: privateTemplates,
      personalizable_templates: personalizedTemplates,
      templates_by_genre: templatesByGenre,
      price_statistics: priceStats[0] || {
        avg_price: 0,
        min_price: 0,
        max_price: 0,
      },
    };
  } catch (error) {
    throw new ErrorHandler("Failed to fetch book template statistics", 500);
  }
};

userSchema.statics.getPersonalizedBookStatistics = async function () {
  try {
    // Get the actual Mongoose model for PersonalizedBook
    const PersonalizedBookModel = mongoose.model("PersonalizedBook");

    const totalPersonalizedBooks = await PersonalizedBookModel.countDocuments();

    const paidBooks = await PersonalizedBookModel.countDocuments({
      is_paid: true,
    });

    const unpaidBooks = await PersonalizedBookModel.countDocuments({
      is_paid: false,
    });

    // Personalized books by gender preference
    const booksByGender = await PersonalizedBookModel.aggregate([
      {
        $group: {
          _id: "$gender_preference",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          gender: "$_id",
          count: 1,
          _id: 0,
        },
      },
    ]);

    // Average age of children in personalized books
    const ageStats = await PersonalizedBookModel.aggregate([
      {
        $match: { child_age: { $ne: null } },
      },
      {
        $group: {
          _id: null,
          avg_age: { $avg: "$child_age" },
          min_age: { $min: "$child_age" },
          max_age: { $max: "$child_age" },
        },
      },
    ]);

    return {
      total_personalized_books: totalPersonalizedBooks,
      paid_books: paidBooks,
      unpaid_books: unpaidBooks,
      books_by_gender: booksByGender,
      age_statistics: ageStats[0] || {
        avg_age: 0,
        min_age: 0,
        max_age: 0,
      },
    };
  } catch (error) {
    throw new ErrorHandler("Failed to fetch personalized book statistics", 500);
  }
};

userSchema.statics.getPaymentStatistics = async function () {
  try {
    // Get the actual Mongoose model for PersonalizedBook
    const PersonalizedBookModel = mongoose.model("PersonalizedBook");

    // Total revenue from paid personalized books
    const revenueStats = await PersonalizedBookModel.aggregate([
      {
        $match: { is_paid: true },
      },
      {
        $group: {
          _id: null,
          total_revenue: { $sum: "$price" },
          average_payment: { $avg: "$price" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Revenue by month (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const revenueByMonth = await PersonalizedBookModel.aggregate([
      {
        $match: {
          is_paid: true,
          payment_date: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$payment_date" },
            month: { $month: "$payment_date" },
          },
          revenue: { $sum: "$price" },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 },
      },
      {
        $project: {
          month: {
            $dateToString: {
              format: "%Y-%m",
              date: {
                $dateFromParts: {
                  year: "$_id.year",
                  month: "$_id.month",
                  day: 1,
                },
              },
            },
          },
          revenue: 1,
          count: 1,
          _id: 0,
        },
      },
    ]);

    return {
      revenue_statistics: revenueStats[0] || {
        total_revenue: 0,
        average_payment: 0,
        count: 0,
      },
      revenue_by_month: revenueByMonth,
    };
  } catch (error) {
    throw new ErrorHandler("Failed to fetch payment statistics", 500);
  }
};

userSchema.statics.getAllRoles = async function () {
  try {
    return await RoleModel.getAllRoles();
  } catch (error) {
    throw new ErrorHandler("Failed to fetch roles", 500);
  }
};

userSchema.statics.getGenreStatistics = async function () {
  try {
    // Get the actual Mongoose models
    const BookTemplateModel = mongoose.model("BookTemplate");
    const PersonalizedBookModel = mongoose.model("PersonalizedBook");

    // Genre distribution in templates
    const templateGenres = await BookTemplateModel.aggregate([
      {
        $group: {
          _id: "$genre",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          genre: "$_id",
          count: 1,
          type: "template",
          _id: 0,
        },
      },
    ]);

    // Genre distribution in personalized books
    const personalizedBookGenres = await PersonalizedBookModel.aggregate([
      {
        $group: {
          _id: "$personalized_content.genre",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          genre: "$_id",
          count: 1,
          type: "personalized",
          _id: 0,
        },
      },
    ]);

    // Combine and sort by count
    const allGenres = [...templateGenres, ...personalizedBookGenres];
    allGenres.sort((a, b) => b.count - a.count);

    return allGenres;
  } catch (error) {
    throw new ErrorHandler("Failed to fetch genre statistics", 500);
  }
};

userSchema.statics.getRecentActivities = async function () {
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Get the actual Mongoose models
    const BookTemplateModel = mongoose.model("BookTemplate");
    const PersonalizedBookModel = mongoose.model("PersonalizedBook");

    // Recent user signups
    const recentUsers = await this.find({
      createdAt: { $gte: oneWeekAgo },
    })
      .select("username email createdAt")
      .sort({ createdAt: -1 })
      .limit(5);

    // Recent book template creations
    const recentTemplates = await BookTemplateModel.find({
      createdAt: { $gte: oneWeekAgo },
    })
      .select("book_title user_id createdAt")
      .populate("user_id", "username email")
      .sort({ createdAt: -1 })
      .limit(5);

    // Recent personalized book creations
    const recentPersonalizedBooks = await PersonalizedBookModel.find({
      createdAt: { $gte: oneWeekAgo },
    })
      .select("child_name user_id price is_paid createdAt")
      .populate("user_id", "username email")
      .sort({ createdAt: -1 })
      .limit(5);

    // Recent payments
    const recentPayments = await PersonalizedBookModel.find({
      is_paid: true,
      payment_date: { $gte: oneWeekAgo },
    })
      .select("child_name user_id price payment_date")
      .populate("user_id", "username email")
      .sort({ payment_date: -1 })
      .limit(5);

    return {
      recent_users: recentUsers,
      recent_templates: recentTemplates,
      recent_personalized_books: recentPersonalizedBooks,
      recent_payments: recentPayments,
    };
  } catch (error) {
    throw new ErrorHandler("Failed to fetch recent activities", 500);
  }
};

userSchema.statics.getUsersList = async function (filters = {}) {
  try {
    const { page = 1, limit = 20, role, search } = filters;
    const skip = (page - 1) * limit;

    // Build query
    const query = {};
    if (role) query.role = parseInt(role);
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { firstname: { $regex: search, $options: "i" } },
        { lastname: { $regex: search, $options: "i" } },
      ];
    }

    const users = await this.find(query)
      .select("-password")
      .populate("role", "role_name")
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await this.countDocuments(query);

    return {
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    throw new ErrorHandler("Failed to fetch users list", 500);
  }
};

const User = mongoose.model("User", userSchema);

export default User;
