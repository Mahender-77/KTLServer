import User from "../models/User";
import RefreshToken from "../models/RefreshToken";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/generateToken";
import { hashRefreshToken } from "../utils/tokenHash";
import { AppError } from "../utils/AppError";

const REFRESH_TOKEN_DAYS = 7;

function refreshExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_TOKEN_DAYS);
  return d;
}

async function saveRefreshToken(userId: string, refreshToken: string): Promise<void> {
  await RefreshToken.create({
    user: userId,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: refreshExpiresAt(),
    revoked: false,
  });
}

export async function register(data: { name: string; email: string; password: string }) {
  const userExists = await User.findOne({ email: data.email });
  if (userExists) throw new AppError("User already exists", 400, "USER_EXISTS");

  const user = await User.create(data);
  const userId = user._id.toString();
  const accessToken = generateAccessToken(userId);
  const refreshToken = generateRefreshToken(userId);
  await saveRefreshToken(userId, refreshToken);
  return { message: "User registered successfully", accessToken, refreshToken };
}

export async function login(data: { email: string; password: string }) {
  console.log("login data", data);
  const user = await User.findOne({ email: data.email }).select("+password");
  if (!user) throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
  const isMatch = await user.comparePassword(data.password);
  if (!isMatch) throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");

  const userId = user._id.toString();
  const accessToken = generateAccessToken(userId);
  const refreshToken = generateRefreshToken(userId);
  await saveRefreshToken(userId, refreshToken);
  return { message: "Login successful", accessToken, refreshToken };
}

export async function refresh(refreshToken: string) {
  let decoded: { id: string };
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError("Invalid or expired refresh token", 401, "REFRESH_TOKEN_INVALID");
  }
  const tokenHash = hashRefreshToken(refreshToken);
  const stored = await RefreshToken.findOne({
    tokenHash,
    user: decoded.id,
    revoked: false,
  });
  if (!stored || stored.expiresAt < new Date()) {
    throw new AppError("Invalid or expired refresh token", 401, "REFRESH_TOKEN_INVALID");
  }
  await RefreshToken.updateOne({ _id: stored._id }, { revoked: true });
  const newAccessToken = generateAccessToken(decoded.id);
  const newRefreshToken = generateRefreshToken(decoded.id);
  await saveRefreshToken(decoded.id, newRefreshToken);
  return { message: "Tokens refreshed", accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function logout(refreshToken: string | undefined) {
  if (refreshToken) {
    await RefreshToken.updateOne({ tokenHash: hashRefreshToken(refreshToken) }, { revoked: true });
  }
  return { message: "Logged out" };
}

export async function getCurrentUser(userId: string) {
  const user = await User.findById(userId).select("-password");
  if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
  return { name: user.name, email: user.email, role: user.role };
}
