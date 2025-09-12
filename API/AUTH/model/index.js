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

const User = mongoose.model("User", userSchema);

export default User;
