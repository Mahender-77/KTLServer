import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import { AppError } from "../utils/AppError";

interface AuthRequest extends Request {
  user?: any;
}

export const protect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  let token: string | undefined;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return next(new AppError("Not authorized, no token", 401, "NO_TOKEN"));
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as { id: string };

    const user = await User.findById(decoded.id);
    if (!user) {
      return next(new AppError("User not found", 401, "USER_NOT_FOUND"));
    }

    req.user = user;
    next();
  } catch (err) {
    if (err && typeof err === "object" && "name" in err && err.name === "TokenExpiredError") {
      return next(new AppError("Access token expired", 401, "TOKEN_EXPIRED"));
    }
    return next(new AppError("Not authorized, token failed", 401, "TOKEN_INVALID"));
  }
};

// 👑 Admin Only Middleware
export const adminOnly = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    return res.status(403).json({ message: "Admin access required" });
  }
};
