import mongoose from "mongoose";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

const tempUserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  firstname: { type: String, required: true },
  lastname: { type: String, required: true },
  phonenumber: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
  role: { type: Number, required: true },
  otp: { type: String, required: true },
  otpExpires: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now, expires: 60 },
});

tempUserSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  }
  next();
});

const TempUser = mongoose.model("TempUser", tempUserSchema);

export default TempUser;
