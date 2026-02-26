import { Request, Response } from "express";
import * as categoryService from "../services/category.service";

export const createCategory = async (req: Request, res: Response) => {
  const category = await categoryService.createCategory(req.body);
  res.status(201).json(category);
};

export const getCategories = async (_req: Request, res: Response) => {
  const tree = await categoryService.getCategoriesTree();
  res.json(tree);
};

export const getSubCategories = async (req: Request, res: Response) => {
  const parentId = (Array.isArray(req.params.parentId) ? req.params.parentId[0] : req.params.parentId) ?? "";
  const subCategories = await categoryService.getSubCategories(parentId);
  res.json(subCategories);
};

export const getFlatCategories = async (_req: Request, res: Response) => {
  const categories = await categoryService.getFlatCategories();
  res.json(categories);
};

export const getCategoryById = async (req: Request, res: Response) => {
  const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) ?? "";
  const category = await categoryService.getCategoryById(id);
  res.json(category);
};

export const updateCategory = async (req: Request, res: Response) => {
  const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) ?? "";
  const category = await categoryService.updateCategory(id, req.body);
  res.json(category);
};

export const deleteCategory = async (req: Request, res: Response) => {
  const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) ?? "";
  const result = await categoryService.deleteCategory(id);
  res.json(result);
};
