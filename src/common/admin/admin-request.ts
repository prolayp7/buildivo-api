import { Request } from 'express';

export interface AuthenticatedAdmin {
  id: number;
  email: string;
  name: string;
  roleId: number;
  permissionKeys: string[];
}

export interface AdminRequest extends Request {
  adminUser?: AuthenticatedAdmin;
}
