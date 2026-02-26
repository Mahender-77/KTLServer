import { Request, Response } from "express";
import * as authService from "../services/auth.service";

interface AuthRequest extends Request {
  user?: any;
}

export const registerUser = async (req: Request, res: Response) => {
  const result = await authService.register(req.body);
  res.status(201).json(result);
};

export const loginUser = async (req: Request, res: Response) => {
  console.log("login data",req.body)
  const result = await authService.login(req.body);
  res.status(200).json(result);
};

export const refreshTokens = async (req: Request, res: Response) => {
  const result = await authService.refresh(req.body.refreshToken);
  res.status(200).json(result);
};

export const logoutUser = async (req: Request, res: Response) => {
  const result = await authService.logout(req.body.refreshToken);
  res.status(200).json(result);
};

export const getCurrentUser = async (req: AuthRequest, res: Response) => {
  const result = await authService.getCurrentUser(req.user._id.toString());
  res.json(result);
};
