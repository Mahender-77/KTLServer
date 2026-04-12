import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import * as adminService from "../services/admin.service";
import { CreateAdminBody, CreateUserBody } from "../validators/admin.validator";

export const createAdmin = async (req: AuthRequest, res: Response) => {
  const body = req.body as CreateAdminBody;
  if (!req.user?.organizationId) {
    return res.status(403).json({ message: "Organization context is required" });
  }
  const result = await adminService.createAdminUser({
    ...body,
    organizationId: req.user.organizationId.toString(),
  });
  res.status(201).json(result);
};

export const createUser = async (req: AuthRequest, res: Response) => {
  const body = req.body as CreateUserBody;
  if (!req.user?.organizationId) {
    return res.status(403).json({ message: "Organization context is required" });
  }
  const result = await adminService.createUserInOrganization({
    name: body.name,
    email: body.email,
    password: body.password,
    role: body.role,
    organizationId: req.user.organizationId.toString(),
  });
  res.status(201).json(result);
};
