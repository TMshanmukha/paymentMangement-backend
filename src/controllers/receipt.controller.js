import { asyncHandler } from '../utils/asyncHandler.js';
import * as paymentService from '../services/payment.service.js';

// Receipt data reuses the payment detail (with previous_paid / remaining_due computed).
// PDF generation is handled client-side via browser print (see spec section 17) —
// this endpoint just supplies the structured data the ReceiptPreview component renders.
export const getReceipt = asyncHandler(async (req, res) => {
  const receipt = await paymentService.getPaymentById(req.user, req.params.id);
  res.json({ success: true, data: receipt });
});
