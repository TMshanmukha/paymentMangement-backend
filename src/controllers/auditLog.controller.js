import { asyncHandler } from '../utils/asyncHandler.js';
import * as auditLogService from '../services/auditLog.service.js';

export const list = asyncHandler(async (req, res) => {
  const data = await auditLogService.listAuditLogs(req.query);
  res.json({ success: true, data });
});
