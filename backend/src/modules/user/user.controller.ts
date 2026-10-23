import { Request, Response } from "express";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import UserService from "./user.service.js";
import { validateUpdateProfileSchema, validateDeleteAccountSchema } from "./user.validators.js";
import { deleteFromCloudinary, extractPublicId, uploadToCloudinary } from "@/utils/cloudinary.js";

const userService = new UserService();

export const getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await userService.getProfile(req.user!.id);
        sendResponse(res, true, result, "Profile fetched successfully", STATUS_CODES.OK);
    } catch (error: any) {
        console.error("Get profile error", error);
        sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
    }
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const { error, value } = validateUpdateProfileSchema(req.body);

        if (error) {
            sendResponse(res, false, error, error.message, STATUS_CODES.BAD_REQUEST);
            return;
        }

        // If a file was uploaded, push it to Cloudinary
        if (req.file) {
            // Fetch current profile to check for existing Cloudinary image
            const currentUser = await userService.getProfile(req.user!.id);

            const { url } = await uploadToCloudinary(req.file.buffer);
            value.profileImage = url;

            // Delete old profile picture if it's from Cloudinary
            if (currentUser.profileImage && currentUser.profileImage.includes("cloudinary.com")) {
                const publicId = extractPublicId(currentUser.profileImage);
                if (publicId) {
                    await deleteFromCloudinary(publicId).catch(err => {
                        console.error("Failed to delete old profile image from Cloudinary:", err);
                    });
                }
            }
        }

        const result = await userService.updateProfile(req.user!.id, value);
        sendResponse(res, true, result, "Profile updated successfully", STATUS_CODES.OK);
    } catch (error: any) {
        console.error("Update profile error", error);
        sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
    }
};

export const listUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await userService.listUsers(req.query, req.user!.role, req.user!.id);
        sendResponse(res, true, result, "Users fetched successfully", STATUS_CODES.OK);
    } catch (error: any) {
        console.error("List users error", error);
        sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
    }
};

export const softDeleteUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const targetId = parseInt(req.params.id as string);
        const isAdmin = req.user!.role === "ADMIN" || req.user!.role === "SUPERADMIN";

        if (!isAdmin && req.user!.id !== targetId) {
            sendResponse(res, false, null, "You can only delete your own account", STATUS_CODES.FORBIDDEN);
            return;
        }

        const result = await userService.softDelete(targetId);
        sendResponse(res, true, result, "User deleted successfully", STATUS_CODES.OK);
    } catch (error: any) {
        console.error("Delete user error", error);
        sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
    }
};

export const requestAccountDeletionOtp = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await userService.requestAccountDeletionOtp(req.user!.id);
        sendResponse(res, true, result, "Verification code sent to your email", STATUS_CODES.OK);
    } catch (error: any) {
        console.error("Request account deletion OTP error", error);
        sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
    }
};

export const deleteMyAccount = async (req: Request, res: Response): Promise<void> => {
    try {
        const { error, value } = validateDeleteAccountSchema(req.body);
        if (error) {
            sendResponse(res, false, error, error.message, STATUS_CODES.BAD_REQUEST);
            return;
        }

        const result = await userService.deleteMyAccount(req.user!.id, value.otp);
        sendResponse(res, true, result, "Your account has been deleted", STATUS_CODES.OK);
    } catch (error: any) {
        console.error("Delete my account error", error);
        sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
    }
};

export const adminUpdateUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await userService.adminUpdateUser(parseInt(req.params.id as string), req.body, req.user!.role);
        sendResponse(res, true, result, "User updated successfully", STATUS_CODES.OK);
    } catch (error: any) {
        console.error("Admin update user error", error);
        sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
    }
};

export const getUserUsage = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await userService.getUserUsage(parseInt(req.params.id as string), req.query);
        sendResponse(res, true, result, "User usage fetched successfully", STATUS_CODES.OK);
    } catch (error: any) {
        console.error("Get user usage error", error);
        sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
    }
};

export const getUserSubscription = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await userService.getUserSubscription(parseInt(req.params.id as string));
        sendResponse(res, true, result, "User subscription fetched successfully", STATUS_CODES.OK);
    } catch (error: any) {
        console.error("Get user subscription error", error);
        sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
    }
};
