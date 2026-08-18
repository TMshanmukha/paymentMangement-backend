import { asyncHandler } from '../utils/asyncHandler.js';
import * as userService from '../services/user.service.js';

export const list = asyncHandler(async (req, res) => {
  const data = await userService.listUsers(req.user);
  res.json({ success: true, data });
});

export const create = asyncHandler(async (req, res) => {
  const data = await userService.createUser(req.user, req.body);
  res.status(201).json({ success: true, message: 'Accountant added successfully', data });
});

export const update = asyncHandler(async (req, res) => {
  const data = await userService.updateUser(req.user, req.params.id, req.body);
  res.json({ success: true, message: 'User updated successfully', data });
});

export const updateStatus = asyncHandler(async (req, res) => {
  const data = await userService.updateUserStatus(req.user, req.params.id, req.body.status);
  res.json({ success: true, message: 'User status updated', data });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const data = await userService.resetPassword(req.user, req.params.id, req.body.newPassword);
  res.json({ success: true, message: 'Password reset successfully', data });
});
