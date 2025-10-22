import mongoose from "mongoose";
import bcrypt from "bcrypt";
import ErrorHandler from "../../../CORE/middleware/errorhandler/index.js";
import RoleModel from "../../ROLES/model/index.js";
import TempUser from "../OTP/new.user/index.js";
import PasswordReset from "../OTP/forgot.password/index.js";
import emailService from "../../../CORE/services/Email/index.js";
import logger from "../../../CORE/utils/logger/index.js";
import crypto from "crypto";
import { PASSWORD_RESET_RECOMMENDATION } from "../../../CORE/utils/constants/index.js";

const SALT_ROUNDS = 10;

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    phonenumber: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: Number, required: true, ref: "Role" },
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
  if (this.isModified("password") && !this.password.startsWith("$2b$")) {
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
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });
    return user;
  }
  return null;
};

userSchema.statics.registerWithOTP = async function (userData) {
  try {
    const existingTempUser = await TempUser.findOne({
      $or: [
        { email: userData.email },
        { username: userData.username },
        { phonenumber: userData.phonenumber },
      ],
    });

    const existingUser = await this.findOne({
      $or: [
        { email: userData.email },
        { username: userData.username },
        { phonenumber: userData.phonenumber },
      ],
    });

    if (existingUser || existingTempUser) {
      if (
        existingUser?.email === userData.email ||
        existingTempUser?.email === userData.email
      ) {
        throw new ErrorHandler("Email is already in use.", 406);
      }
      if (
        existingUser?.username === userData.username ||
        existingTempUser?.username === userData.username
      ) {
        throw new ErrorHandler("Username is already in use.", 406);
      }
    }
    const exisitingNumber = await User.findOne({
      phonenumber: userData.phoneNumber,
    });
    if (existingNumber) {
      throw new ErrorHandler("phoneNumber is already in use.", 406);
    }

    const otp = this.generateAlphanumericOTP(6);
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000);
    const tempUser = new TempUser({
      username: userData.username,
      firstname: userData.firstName,
      lastname: userData.lastName,
      phonenumber: userData.phoneNumber,
      email: userData.email,
      password: userData.password,
      role: await RoleModel.getRoleName("User"),
      otp,
      otpExpires,
    });

    await tempUser.save();
    return {
      message: "OTP sent to your email",
      tempUserId: tempUser._id,
      otp: otp,
    };
  } catch (error) {
    if (error instanceof ErrorHandler) throw error;
    throw new ErrorHandler("Failed to register user with OTP", 500);
  }
};
userSchema.statics.createAdmin = async function (userData) {
  try {
    const existingTempUser = await TempUser.findOne({
      $or: [
        { email: userData.email },
        { username: userData.username },
        { phonenumber: userData.phonenumber },
      ],
    });

    const existingUser = await this.findOne({
      $or: [
        { email: userData.email },
        { username: userData.username },
        { phonenumber: userData.phonenumber },
      ],
    });

    if (existingUser || existingTempUser) {
      if (
        existingUser?.email === userData.email ||
        existingTempUser?.email === userData.email
      ) {
        throw new ErrorHandler("Email is already in use.", 406);
      }
      if (
        existingUser?.username === userData.username ||
        existingTempUser?.username === userData.username
      ) {
        throw new ErrorHandler("Username is already in use.", 406);
      }
      if (
        existingUser?.phonenumber === userData.phonenumber ||
        existingTempUser?.phonenumber === userData.phonenumber
      ) {
        throw new ErrorHandler("Phone number is already in use.", 406);
      }
    }

    const newUser = new User({
      username: userData.userName,
      firstname: userData.firstName,
      lastname: userData.lastName,
      phonenumber: userData.phoneNumber,
      email: userData.email,
      password: userData.password,
      role: await RoleModel.getRoleName(userData.role),
    });

    await newUser.save();
    const newUserWithoutPassword = newUser.toObject();
    delete newUserWithoutPassword.password;

    return {
      message: "Admin created",
      newUser: newUserWithoutPassword, // Return the object without the password
    };
  } catch (error) {
    console.log(error);
    if (error instanceof ErrorHandler) throw error;
    throw new ErrorHandler("Failed to create User", 500);
  }
};

userSchema.statics.generateAlphanumericOTP = function (length) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnopqrstuvwxyz23456789";
  let otp = "";

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    otp += chars[randomIndex];
  }

  return otp;
};

userSchema.statics.resendOTP = async function (tempUserId) {
  try {
    const tempUser = await TempUser.findById(tempUserId);

    if (!tempUser) {
      throw new ErrorHandler("Session Expired", 400);
    }
    const otp = this.generateAlphanumericOTP(6);
    const otpExpires = new Date(Date.now() + 1 * 60 * 1000);
    tempUser.otp = otp;
    tempUser.otpExpires = otpExpires;
    await tempUser.save();

    return { message: "New OTP sent to your email", tempUser };
  } catch (error) {
    if (error instanceof ErrorHandler) throw error;
    throw new ErrorHandler("Failed to resend OTP", 500);
  }
};

userSchema.statics.verifyOTP = async function (tempUserId, otp) {
  try {
    const tempUser = await TempUser.findById(tempUserId);

    if (!tempUser) {
      throw new ErrorHandler("Invalid or expired OTP", 400);
    }

    if (tempUser.otpExpires < new Date()) {
      await TempUser.findByIdAndDelete(tempUserId);
      throw new ErrorHandler("OTP has expired", 400);
    }

    if (tempUser.otp !== otp) {
      throw new ErrorHandler("Invalid OTP", 400);
    }

    const newUser = new this({
      username: tempUser.username,
      firstname: tempUser.firstname,
      lastname: tempUser.lastname,
      phonenumber: tempUser.phonenumber,
      email: tempUser.email,
      password: tempUser.password,
      role: tempUser.role,
      isVerified: true,
    });
    await newUser.save();

    await TempUser.findByIdAndDelete(tempUserId);

    return {
      email: newUser.email,
      username: newUser.username,
      firstname: newUser.firstname,
      lastname: newUser.lastname,
      phonenumber: newUser.phonenumber,
    };
  } catch (error) {
    if (error instanceof ErrorHandler) throw error;
    throw new ErrorHandler("Failed to verify OTP", 500);
  }
};

userSchema.statics.getDashboardStats = async function () {
  try {
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

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const newUsers = await this.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
    });

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
    const PersonalizedBookModel = mongoose.model("PersonalizedBook");

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
    const BookTemplateModel = mongoose.model("BookTemplate");
    const PersonalizedBookModel = mongoose.model("PersonalizedBook");

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
    const BookTemplateModel = mongoose.model("BookTemplate");
    const PersonalizedBookModel = mongoose.model("PersonalizedBook");

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

    const PersonalizedBookModel = mongoose.model("PersonalizedBook");
    const ReceiptModel = mongoose.model("Receipt");
    const RoleModel = mongoose.model("Role");

    const users = await this.find(query)
      .select("-password")
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 })
      .lean();

    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const paidBooks = await PersonalizedBookModel.countDocuments({
          user_id: user._id.toString(),
          is_paid: true,
        });

        const receipts = await ReceiptModel.find({
          user_id: user._id,
          status: "succeeded",
        });

        const totalAmountSpent = receipts.reduce(
          (sum, receipt) => sum + receipt.amount,
          0,
        );

        const roleInfo = await RoleModel.findOne({ role_id: user.role });
        const roleName = roleInfo ? roleInfo.role_name : "Unknown";

        return {
          _id: user._id,
          fullName: `${user.firstname} ${user.lastname}`,
          username: user.username,
          totalBooksPaid: paidBooks,
          totalAmountSpent: totalAmountSpent,
          status: user.isActive ? "Active" : "Inactive",
          lastLoggedIn: user.lastLogin,
          contact: {
            email: user.email,
            phoneNumber: user.phonenumber,
          },
          role: roleName,
          createdAt: user.createdAt,
        };
      }),
    );

    const totalUsers = await this.countDocuments(query);
    const activeUsers = await this.countDocuments({ ...query, isActive: true });
    const inactiveUsers = await this.countDocuments({
      ...query,
      isActive: false,
    });

    return {
      users: usersWithStats,
      counts: {
        totalUsers,
        activeUsers,
        inactiveUsers,
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalUsers,
        pages: Math.ceil(totalUsers / limit),
      },
    };
  } catch (error) {
    throw new ErrorHandler("Failed to fetch users list", 500);
  }
};
userSchema.statics.getUserDashboard = async function (userId) {
  try {
    const userInfo = await this.findById(userId).select("-password");

    if (!userInfo) {
      throw new ErrorHandler("User not found", 404);
    }

    const [userPersonalizedBooks, userPaymentStats, recentUserActivities] =
      await Promise.all([
        this.getUserPersonalizedBooks(userId),
        this.getUserPaymentStatistics(userId),
        this.getRecentUserActivities(userId),
      ]);

    return {
      user_info: {
        id: userInfo._id,
        username: userInfo.username,
        firstname: userInfo.firstname,
        lastname: userInfo.lastname,
        email: userInfo.email,
        phonenumber: userInfo.phonenumber,
        role: userInfo.role,
        lastLogin: userInfo.lastLogin,
        createdAt: userInfo.createdAt,
      },
      personalized_books: userPersonalizedBooks,
      payment_statistics: userPaymentStats,
      recent_activities: recentUserActivities,
    };
  } catch (error) {
    console.log(error);
    throw new ErrorHandler("Failed to fetch user dashboard statistics", 500);
  }
};

userSchema.statics.getUserPersonalizedBooks = async function (userId) {
  try {
    const PersonalizedBookModel = mongoose.model("PersonalizedBook");

    const totalPersonalizedBooks = await PersonalizedBookModel.countDocuments({
      user_id: userId,
    });

    const paidBooks = await PersonalizedBookModel.countDocuments({
      user_id: userId,
      is_paid: true,
    });

    const unpaidBooks = await PersonalizedBookModel.countDocuments({
      user_id: userId,
      is_paid: false,
    });

    // Personalized books by genre for this user
    const booksByGenre = await PersonalizedBookModel.aggregate([
      {
        $match: { user_id: userId },
      },
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
          _id: 0,
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    const booksByGender = await PersonalizedBookModel.aggregate([
      {
        $match: { user_id: userId },
      },
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

    const ageStats = await PersonalizedBookModel.aggregate([
      {
        $match: {
          user_id: userId,
          child_age: { $ne: null },
        },
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

    const recentPersonalizedBooks = await PersonalizedBookModel.find({
      user_id: userId,
    })
      .select("child_name child_age gender_preference price is_paid createdAt")
      .sort({ createdAt: -1 })
      .limit(10);

    return {
      total_personalized_books: totalPersonalizedBooks,
      paid_books: paidBooks,
      unpaid_books: unpaidBooks,
      books_by_genre: booksByGenre,
      books_by_gender: booksByGender,
      age_statistics: ageStats[0] || {
        avg_age: 0,
        min_age: 0,
        max_age: 0,
      },
      recent_personalized_books: recentPersonalizedBooks,
    };
  } catch (error) {
    throw new ErrorHandler(
      "Failed to fetch user personalized book statistics",
      500,
    );
  }
};

userSchema.statics.getUserPaymentStatistics = async function (userId) {
  try {
    const PersonalizedBookModel = mongoose.model("PersonalizedBook");
    const revenueStats = await PersonalizedBookModel.aggregate([
      {
        $match: {
          user_id: userId,
          is_paid: true,
        },
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

    // Revenue by month for user (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const revenueByMonth = await PersonalizedBookModel.aggregate([
      {
        $match: {
          user_id: userId,
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

    const recentPayments = await PersonalizedBookModel.find({
      user_id: userId,
      is_paid: true,
    })
      .select("child_name price payment_date")
      .sort({ payment_date: -1 })
      .limit(10);

    return {
      revenue_statistics: revenueStats[0] || {
        total_revenue: 0,
        average_payment: 0,
        count: 0,
      },
      revenue_by_month: revenueByMonth,
      recent_payments: recentPayments,
    };
  } catch (error) {
    throw new ErrorHandler("Failed to fetch user payment statistics", 500);
  }
};

userSchema.statics.getRecentUserActivities = async function (userId) {
  try {
    const PersonalizedBookModel = mongoose.model("PersonalizedBook");

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const recentPersonalizedBooks = await PersonalizedBookModel.find({
      user_id: userId,
      createdAt: { $gte: oneWeekAgo },
    })
      .select("child_name price is_paid createdAt")
      .sort({ createdAt: -1 })
      .limit(10);

    const recentPayments = await PersonalizedBookModel.find({
      user_id: userId,
      is_paid: true,
      payment_date: { $gte: oneWeekAgo },
    })
      .select("child_name price payment_date")
      .sort({ payment_date: -1 })
      .limit(10);

    return {
      recent_personalized_books: recentPersonalizedBooks,
      recent_payments: recentPayments,
    };
  } catch (error) {
    throw new ErrorHandler("Failed to fetch recent user activities", 500);
  }
};

userSchema.statics.updateProfile = async function (userId, updateData) {
  try {
    const user = await this.findById(userId);
    if (!user) {
      throw new ErrorHandler("User not found", 404);
    }
    if (updateData.email && updateData.email !== user.email) {
      const existingUser = await this.findOne({ email: updateData.email });
      if (existingUser) {
        throw new ErrorHandler("Email is already in use.", 406);
      }
    }
    if (updateData.username && updateData.username !== user.username) {
      const existingUser = await this.findOne({
        username: updateData.username,
      });
      if (existingUser) {
        throw new ErrorHandler("Username is already in use.", 406);
      }
    }

    // Check if phone number is being updated and if it's already taken
    if (updateData.phonenumber && updateData.phonenumber !== user.phonenumber) {
      const existingUser = await this.findOne({
        phonenumber: updateData.phonenumber,
      });
      if (existingUser) {
        throw new ErrorHandler("Phone number is already in use.", 406);
      }
    }

    // Update allowed fields
    const allowedUpdates = [
      "firstname",
      "lastname",
      "email",
      "username",
      "phonenumber",
      "bio",
      "preferences",
      "profilePicture",
    ];

    allowedUpdates.forEach((field) => {
      if (updateData[field] !== undefined) {
        user[field] = updateData[field];
      }
    });

    await user.save();

    // Return user without password
    const userObject = user.toObject();
    delete userObject.password;
    return userObject;
  } catch (error) {
    if (error instanceof ErrorHandler) throw error;
    throw new ErrorHandler("Failed to update profile", 500);
  }
};

userSchema.statics.updatePassword = async function (
  userId,
  currentPassword,
  newPassword,
) {
  try {
    const user = await this.findById(userId);
    if (!user) {
      throw new ErrorHandler("User not found", 404);
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      throw new ErrorHandler("Current password is incorrect", 401);
    }

    // Update password
    user.password = newPassword;
    await user.save();

    return { message: "Password updated successfully" };
  } catch (error) {
    if (error instanceof ErrorHandler) throw error;
    throw new ErrorHandler("Failed to update password", 500);
  }
};

userSchema.statics.uploadProfilePicture = async function (userId, imageFile) {
  try {
    const user = await this.findById(userId);
    if (!user) {
      throw new ErrorHandler("User not found", 404);
    }

    // Delete old profile picture if it exists
    if (user.profilePicture) {
      try {
        const oldImageKey = user.profilePicture.split("/").pop();
        await this.s3Service.deleteImage(oldImageKey);
      } catch (error) {
        console.warn("Failed to delete old profile picture:", error.message);
      }
    }

    // Upload new profile picture to S3
    const imageKey = this.s3Service.generateImageKey(
      `users/${userId}/profile`,
      imageFile.originalname,
    );
    const imageUrl = await this.s3Service.uploadImage(
      imageFile.buffer,
      imageKey,
      imageFile.mimetype,
    );

    // Update user profile picture
    user.profilePicture = imageUrl;
    await user.save();

    return { profilePicture: imageUrl };
  } catch (error) {
    if (error instanceof ErrorHandler) throw error;
    throw new ErrorHandler("Failed to upload profile picture", 500);
  }
};

userSchema.statics.deleteProfilePicture = async function (userId) {
  try {
    const user = await this.findById(userId);
    if (!user) {
      throw new ErrorHandler("User not found", 404);
    }

    if (!user.profilePicture) {
      throw new ErrorHandler("No profile picture to delete", 400);
    }

    // Delete from S3
    const imageKey = user.profilePicture.split("/").pop();
    await this.s3Service.deleteImage(imageKey);

    // Remove profile picture reference
    user.profilePicture = null;
    await user.save();

    return { message: "Profile picture deleted successfully" };
  } catch (error) {
    if (error instanceof ErrorHandler) throw error;
    throw new ErrorHandler("Failed to delete profile picture", 500);
  }
};

userSchema.statics.requestPasswordReset = async function (email, req) {
  try {
    if (!email) {
      throw new ErrorHandler("Email is required", 400);
    }

    const user = await this.findOne({ email });
    if (!user) {
      logger.warn(`Password reset requested for non-existent email: ${email}`);
      return {
        success: true,
        message:
          "If an account with that email exists, a reset OTP has been sent",
        otpId: null,
      };
    }
    const recentAttempt = await PasswordReset.findOne({
      email,
      createdAt: { $gte: new Date(Date.now() - 2 * 60 * 1000) },
    });

    if (recentAttempt) {
      throw new ErrorHandler("Please wait before requesting another OTP", 429);
    }
    const otp = this.generateSecureOTP(6);
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000);
    const passwordReset = new PasswordReset({
      email,
      otp,
      otpExpires,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers["user-agent"] || "Unknown",
    });

    await passwordReset.save();
    await emailService.sendPasswordResetOTP(email, user.firstname, otp, req);
    logger.info(`Password reset OTP sent to ${email}`, {
      userId: user._id,
      ip: passwordReset.ipAddress,
      userAgent: passwordReset.userAgent,
    });

    return {
      success: true,
      message: "Password reset OTP has been sent to your email",
      otpId: passwordReset._id,
      expiresIn: "15 minutes",
    };
  } catch (error) {
    console.log(error);
    if (error instanceof ErrorHandler) throw error;
    logger.error("Password reset request failed:", error);
    throw new ErrorHandler("Failed to process password reset request", 500);
  }
};
userSchema.statics.resendPasswordResetOTP = async function (email, req) {
  try {
    if (!email) {
      throw new ErrorHandler("Email is required", 400);
    }
    const existingReset = await PasswordReset.findOne({
      email,
      used: false,
      otpExpires: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!existingReset) {
      throw new ErrorHandler(
        "No active OTP request found. Please request a new OTP",
        400,
      );
    }
    if (existingReset.resendCount >= 3) {
      throw new ErrorHandler(
        "Maximum resend attempts reached. Please request a new OTP",
        429,
      );
    }
    const canResendAfter = new Date(
      existingReset.lastResentAt?.getTime() + 60 * 1000,
    );
    if (existingReset.lastResentAt && new Date() < canResendAfter) {
      const waitSeconds = Math.ceil((canResendAfter - new Date()) / 1000);
      throw new ErrorHandler(
        `Please wait ${waitSeconds} seconds before resending OTP`,
        429,
      );
    }

    // Generate new OTP
    const newOTP = this.generateSecureOTP(6);
    const newOTPExpires = new Date(Date.now() + 15 * 60 * 1000);
    existingReset.otp = newOTP;
    existingReset.otpExpires = newOTPExpires;
    existingReset.resendCount += 1;
    existingReset.lastResentAt = new Date();
    existingReset.ipAddress = req.ip || req.connection.remoteAddress;
    existingReset.userAgent = req.headers["user-agent"] || "Unknown";

    await existingReset.save();
    const user = await this.findOne({ email });
    const username = user ? user.firstname : "User";

    await emailService.sendPasswordResetOTP(email, username, newOTP, req);

    logger.info(`Password reset OTP resent to ${email}`, {
      resendCount: existingReset.resendCount,
      ip: existingReset.ipAddress,
    });

    return {
      success: true,
      message: "New OTP has been sent to your email",
      otpId: existingReset._id,
      resendCount: existingReset.resendCount,
      expiresIn: "15 minutes",
    };
  } catch (error) {
    if (error instanceof ErrorHandler) throw error;
    logger.error("Resend password reset OTP failed:", error);
    throw new ErrorHandler("Failed to resend OTP", 500);
  }
};
userSchema.statics.canResendOTP = async function (type, identifier) {
  try {
    let record;

    if (type === "password-reset") {
      record = await PasswordReset.findOne({
        email: identifier,
        used: false,
        otpExpires: { $gt: new Date() },
      }).sort({ createdAt: -1 });
    } else if (type === "registration") {
      record = await TempUser.findById(identifier);
    } else {
      return { canResend: false, reason: "Invalid OTP type" };
    }

    if (!record) {
      return { canResend: false, reason: "No active OTP found" };
    }

    if (record.resendCount >= 3) {
      return { canResend: false, reason: "Maximum resend attempts reached" };
    }

    const canResendAfter = new Date(record.lastResentAt?.getTime() + 60 * 1000);
    if (record.lastResentAt && new Date() < canResendAfter) {
      const waitSeconds = Math.ceil((canResendAfter - new Date()) / 1000);
      return {
        canResend: false,
        reason: `Please wait ${waitSeconds} seconds`,
        waitSeconds,
      };
    }

    return {
      canResend: true,
      resendCount: record.resendCount,
      lastResentAt: record.lastResentAt,
    };
  } catch (error) {
    logger.error("Error checking OTP resend eligibility:", error);
    return { canResend: false, reason: "Error checking eligibility" };
  }
};

userSchema.statics.verifyPasswordResetOTP = async function (otpId, otp, email) {
  try {
    if (!otpId || !otp || !email) {
      throw new ErrorHandler("OTP ID, OTP, and email are required", 400);
    }
    const resetRecord = await PasswordReset.findOne({
      _id: otpId,
      email,
      used: false,
    });

    if (!resetRecord) {
      throw new ErrorHandler("Invalid or expired OTP", 400);
    }
    if (resetRecord.otpExpires < new Date()) {
      await PasswordReset.findByIdAndUpdate(otpId, { used: true });
      throw new ErrorHandler("OTP has expired", 400);
    }
    if (resetRecord.attempts >= 5) {
      await PasswordReset.findByIdAndUpdate(otpId, { used: true });
      throw new ErrorHandler(
        "Too many failed attempts. Please request a new OTP",
        429,
      );
    }
    if (resetRecord.otp !== otp.toUpperCase()) {
      await PasswordReset.findByIdAndUpdate(otpId, {
        $inc: { attempts: 1 },
      });

      const attemptsLeft = 5 - (resetRecord.attempts + 1);
      throw new ErrorHandler(
        `Invalid OTP. ${attemptsLeft} attempts remaining`,
        400,
      );
    }

    await PasswordReset.findByIdAndUpdate(otpId, {
      used: true,
    });

    logger.info(`Password reset OTP verified for ${email}`);

    return {
      success: true,
      message: "OTP verified successfully",
      token: this.generateResetToken(otpId),
    };
  } catch (error) {
    console.log(error);
    if (error instanceof ErrorHandler) throw error;
    logger.error("OTP verification failed:", error);
    throw new ErrorHandler("Failed to verify OTP", 500);
  }
};

userSchema.statics.resetPasswordWithOTP = async function (
  resetToken,
  newPassword,
  confirmPassword,
) {
  try {
    if (!resetToken || !newPassword || !confirmPassword) {
      throw new ErrorHandler("All fields are required", 400);
    }

    // Verify reset token
    const { otpId, valid } = this.verifyResetToken(resetToken);
    if (!valid) {
      throw new ErrorHandler("Invalid or expired reset token", 400);
    }

    // Find the used reset record
    const resetRecord = await PasswordReset.findOne({
      _id: otpId,
      used: true,
    });

    if (!resetRecord) {
      throw new ErrorHandler("Invalid reset request", 400);
    }

    // Check if token was used recently (within 10 minutes)
    if (resetRecord.updatedAt < new Date(Date.now() - 10 * 60 * 1000)) {
      throw new ErrorHandler("Reset token has expired", 400);
    }

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      throw new ErrorHandler("Passwords do not match", 400);
    }

    // Validate password strength
    this.validatePasswordStrength(newPassword);

    // Find user and update password
    const user = await this.findOne({ email: resetRecord.email });
    if (!user) {
      throw new ErrorHandler("User not found", 404);
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Invalidate all existing reset tokens for this user
    await PasswordReset.updateMany(
      { email: user.email, used: false },
      { used: true },
    );

    // Log the password reset
    logger.info(`Password reset successfully for user ${user.email}`, {
      userId: user._id,
      resetVia: "OTP",
    });

    // Send confirmation email
    await this.sendPasswordResetConfirmation(
      user.email,
      user.firstname,
      resetRecord.ipAddress,
    );

    return {
      success: true,
      message: "Password has been reset successfully",
    };
  } catch (error) {
    if (error instanceof ErrorHandler) throw error;
    logger.error("Password reset failed:", error);
    throw new ErrorHandler("Failed to reset password", 500);
  }
};

userSchema.statics.changePassword = async function (
  userId,
  newPassword,
  confirmPassword,
  req,
) {
  try {
    if (!newPassword || !confirmPassword) {
      throw new ErrorHandler("All password fields are required", 400);
    }
    const user = await this.findById(userId);
    if (!user) {
      throw new ErrorHandler("User not found", 404);
    }

    this.validatePasswordStrength(newPassword);

    user.password = newPassword;
    await user.save();

    logger.info(`Password changed successfully for user ${user.email}`, {
      userId: user._id,
      changedVia: "Authenticated request",
      ip: req.ip,
    });
    const recommendation = PASSWORD_RESET_RECOMMENDATION;
    console.log(PASSWORD_RESET_RECOMMENDATION);
    await emailService.sendPasswordChangeNotification(
      user.email,
      user.firstname,
      PASSWORD_RESET_RECOMMENDATION,
      req,
    );

    return {
      success: true,
      message: "Password has been changed successfully",
    };
  } catch (error) {
    console.log(error);
    if (error instanceof ErrorHandler) throw error;
    logger.error("Password change failed:", error);
    throw new ErrorHandler("Failed to change password", 500);
  }
};

userSchema.statics.generateSecureOTP = function (length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let otp = "";

  for (let i = 0; i < length; i++) {
    const randomByte = crypto.randomBytes(1)[0];
    const randomIndex = randomByte % chars.length;
    otp += chars[randomIndex];
  }

  return otp;
};

userSchema.statics.validatePasswordStrength = function (password) {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  if (password.length < minLength) {
    throw new ErrorHandler(
      `Password must be at least ${minLength} characters long`,
      400,
    );
  }

  if (!hasUpperCase || !hasLowerCase) {
    throw new ErrorHandler(
      "Password must contain both uppercase and lowercase letters",
      400,
    );
  }

  if (!hasNumbers) {
    throw new ErrorHandler("Password must contain at least one number", 400);
  }

  if (!hasSpecialChar) {
    throw new ErrorHandler(
      "Password must contain at least one special character",
      400,
    );
  }

  // Check for common passwords (basic check)
  const commonPasswords = ["password", "12345678", "qwerty123", "admin123"];
  if (commonPasswords.includes(password.toLowerCase())) {
    throw new ErrorHandler(
      "Password is too common. Please choose a stronger password",
      400,
    );
  }
};

userSchema.statics.generateResetToken = function (otpId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = Date.now() + 10 * 60 * 1000;
  const payload = {
    otpId: otpId.toString(),
    exp: expires,
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64");
};

userSchema.statics.verifyResetToken = function (token) {
  try {
    const payload = JSON.parse(Buffer.from(token, "base64").toString());

    if (payload.exp < Date.now()) {
      return { valid: false, error: "Token expired" };
    }

    return { valid: true, otpId: payload.otpId };
  } catch (error) {
    return { valid: false, error: "Invalid token" };
  }
};

// Email Methods
// sendPasswordChan
userSchema.statics.sendPasswordResetConfirmation = async function (
  email,
  username,
  ipAddress,
) {
  try {
    await emailService.sendCustomEmail(
      email,
      "Password Reset Successful - My Story Hat",
      "passwordResetConfirmation",
      {
        USER_NAME: username,
        RESET_TIME: new Date().toLocaleString(),
        IP_ADDRESS: ipAddress,
        RECOMMENDATION:
          "If you did not perform this action, please contact support immediately.",
      },
    );
  } catch (error) {
    logger.error("Failed to send password reset confirmation email:", error);
  }
};

userSchema.statics.cleanupExpiredOTPs = async function () {
  try {
    const result = await PasswordReset.deleteMany({
      otpExpires: { $lt: new Date() },
    });

    logger.info(`Cleaned up ${result.deletedCount} expired OTPs`);
    return result.deletedCount;
  } catch (error) {
    logger.error("Failed to cleanup expired OTPs:", error);
  }
};

userSchema.statics.getRecentActivities = async function (days = 7, limit = 10) {
  try {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);

    const BookTemplateModel = mongoose.model("BookTemplate");
    const PersonalizedBookModel = mongoose.model("PersonalizedBook");
    const ReceiptModel = mongoose.model("Receipt");

    // Get recent user registrations
    const recentUsers = await this.find({
      createdAt: { $gte: daysAgo },
    })
      .select("username email firstname lastname createdAt")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Get recent book template creations
    const recentTemplates = await BookTemplateModel.find({
      createdAt: { $gte: daysAgo },
    })
      .select("book_title user_id genre price createdAt")
      .populate("user_id", "username email firstname lastname")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Get recent personalized book creations
    const recentPersonalizedBooks = await PersonalizedBookModel.find({
      createdAt: { $gte: daysAgo },
    })
      .select("child_name child_age user_id price is_paid createdAt")
      .populate("user_id", "username email firstname lastname")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    const recentPayments = await ReceiptModel.find({
      status: "succeeded",
      paid_at: { $gte: daysAgo },
    })
      .select("user_id amount book_details receipt_number paid_at")
      .populate("user_id", "username email firstname lastname")
      .sort({ paid_at: -1 })
      .limit(limit)
      .lean();

    // Format the response for better readability
    const formatActivities = {
      recent_users: recentUsers.map((user) => ({
        type: "user_registration",
        id: user._id,
        username: user.username,
        email: user.email,
        name: `${user.firstname} ${user.lastname}`,
        timestamp: user.createdAt,
        description: `New user registered: ${user.username}`,
      })),

      recent_templates: recentTemplates.map((template) => ({
        type: "template_creation",
        id: template._id,
        title: template.book_title,
        genre: template.genre,
        price: template.price,
        user: template.user_id
          ? {
              id: template.user_id._id,
              username: template.user_id.username,
              name: `${template.user_id.firstname} ${template.user_id.lastname}`,
            }
          : null,
        timestamp: template.createdAt,
        description: `New book template created: "${template.book_title}"`,
      })),

      recent_personalized_books: recentPersonalizedBooks.map((book) => ({
        type: "personalized_book_creation",
        id: book._id,
        child_name: book.child_name,
        child_age: book.child_age,
        price: book.price,
        is_paid: book.is_paid,
        user: book.user_id
          ? {
              id: book.user_id._id,
              username: book.user_id.username,
              name: `${book.user_id.firstname} ${book.user_id.lastname}`,
            }
          : null,
        timestamp: book.createdAt,
        description: `Personalized book created for ${book.child_name}`,
      })),

      recent_payments: recentPayments.map((payment) => ({
        type: "payment",
        id: payment._id,
        amount: payment.amount,
        receipt_number: payment.receipt_number,
        book_title: payment.book_details?.book_title,
        user: payment.user_id
          ? {
              id: payment.user_id._id,
              username: payment.user_id.username,
              name: `${payment.user_id.firstname} ${payment.user_id.lastname}`,
            }
          : null,
        timestamp: payment.paid_at,
        description: `Payment received: $${payment.amount} for "${payment.book_details?.book_title}"`,
      })),
    };

    // Combine all activities into a single timeline
    const allActivities = [
      ...formatActivities.recent_users,
      ...formatActivities.recent_templates,
      ...formatActivities.recent_personalized_books,
      ...formatActivities.recent_payments,
    ]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    return {
      summary: {
        total_users: recentUsers.length,
        total_templates: recentTemplates.length,
        total_personalized_books: recentPersonalizedBooks.length,
        total_payments: recentPayments.length,
        period: `${days} days`,
      },
      by_type: formatActivities,
      timeline: allActivities,
    };
  } catch (error) {
    console.error("Error in getRecentActivities:", error);
    throw new ErrorHandler("Failed to fetch recent activities", 500);
  }
};

const User = mongoose.model("User", userSchema);

export default User;
