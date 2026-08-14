import { asyncHandler } from '../utils/asyncHandler.js';
import * as paymentService from '../services/payment.service.js';

export const list = asyncHandler(async (req, res) => {
  req.query.academicYearId = req.academicYearId;
  const result = await paymentService.listPayments(req.user, req.query);
  res.json({ success: true, data: result });
});

export const getOne = asyncHandler(async (req, res) => {
  const payment = await paymentService.getPaymentById(req.user, req.params.id);
  res.json({ success: true, data: payment });
});

export const create = asyncHandler(async (req, res) => {
  const payment = await paymentService.createPayment(req.user, req.body);
  res.status(201).json({ success: true, message: 'Payment recorded successfully', data: payment });
});

export const cancel = asyncHandler(async (req, res) => {
  const payment = await paymentService.cancelPayment(req.user, req.params.id, req.body.reason);
  res.json({ success: true, message: 'Payment cancelled', data: payment });
});

export const reverse = asyncHandler(async (req, res) => {
  const payment = await paymentService.reversePayment(req.user, req.params.id, req.body.reason);
  res.json({ success: true, message: 'Payment reversed', data: payment });
});
