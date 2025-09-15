import mongoose from "mongoose";
import bcrypt from "bcrypt";
import ErrorHandler from "../../../CORE/middleware/errorhandler/index.js";
import RoleModel from "../../ROLES/model/index.js";

const SALT_ROUNDS = 10;

// Email normalization function
function normalizeEmail(email) {
  if (!email) return email;

  // Convert to lowercase
  let normalized = email.toLowerCase().trim();

  // Split into local part and domain
  const parts = normalized.split("@");
  if (parts.length !== 2) return normalized; // Invalid email format

  let [localPart, domain] = parts;

  // Handle known email providers with special rules
  if (domain === "gmail.com" || domain === "googlemail.com") {
    // Remove dots from local part for Gmail
    localPart = localPart.replace(/\./g, "");

    // Remove everything after '+' for Gmail
    const plusIndex = localPart.indexOf("+");
    if (plusIndex !== -1) {
      localPart = localPart.substring(0, plusIndex);
    }
  }

  // Reassemble the email
  return `${localPart}@${domain}`;
}

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    phonenumber: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: function (v) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: (props) => `${props.value} is not a valid email address!`,
      },
    },
    normalizedEmail: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: Number, required: true, ref: "roles" },
  },
  { timestamps: true },
);

userSchema.pre("save", async function (next) {
  // Normalize email before saving
  if (this.isModified("email")) {
    this.normalizedEmail = normalizeEmail(this.email);
  }

  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  }
  next();
});

userSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

userSchema.statics.findUser = async function (identifier) {
  // Normalize if identifier is an email
  let normalizedIdentifier = identifier;
  if (identifier.includes("@")) {
    normalizedIdentifier = normalizeEmail(identifier);
    return this.findOne({
      $or: [
        { normalizedEmail: normalizedIdentifier },
        { username: identifier },
        { phonenumber: identifier },
      ],
    });
  }

  return this.findOne({
    $or: [
      { email: identifier },
      { username: identifier },
      { phonenumber: identifier },
    ],
  });
};

userSchema.statics.createUser = async function (userData) {
  // Normalize email for comparison
  const normalizedEmail = normalizeEmail(userData.email);

  const existingUser = await this.findOne({
    $or: [
      { normalizedEmail: normalizedEmail },
      { username: userData.userName },
      { phonenumber: userData.phoneNumber },
    ],
  });

  if (existingUser) {
    if (existingUser.normalizedEmail === normalizedEmail) {
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
    normalizedEmail: normalizedEmail,
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
