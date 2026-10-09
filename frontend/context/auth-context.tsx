"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import api from "@/lib/api";

interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  profileImage?: string;
  isGuideTaken: boolean;
  timezone: string;
  userRoles: { role: { id: number; name: string } }[];
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (
    email: string,
    password: string,
  ) => Promise<{
    requiresEmailVerification: boolean;
    email?: string;
    isAdmin?: boolean;
  }>;
  register: (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) => Promise<{
    requiresEmailVerification: boolean;
    user?: User;
    token?: string;
  }>;
  verifyEmailOtp: (email: string, otp: string) => Promise<void>;
  resendEmailOtp: (email: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (
    email: string,
    otp: string,
    newPassword: string,
  ) => Promise<void>;
  completeGoogleLogin: (token: string) => Promise<{ isAdmin: boolean }>;
  logout: () => void;
  hasRole: (role: string) => boolean;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const isAdminUser = (userData: User) => {
  const normalize = (r: string) => r.replace(/_/g, "").toUpperCase();
  return userData.userRoles.some((ur) =>
    ["ADMIN", "SUPERADMIN"].includes(normalize(ur.role.name)),
  );
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === "undefined") return null;
    const storedUser = localStorage.getItem("user");
    if (!storedUser) return null;
    try {
      return JSON.parse(storedUser);
    } catch {
      localStorage.removeItem("user");
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const storedToken = localStorage.getItem("token");
    if (!storedToken) return null;
    return storedToken;
  });
  const [isLoading, setIsLoading] = useState(() => {
    if (typeof window === "undefined") return true;
    return Boolean(localStorage.getItem("token"));
  });

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (!storedToken) {
      return;
    }
    // Fetch fresh profile from server on every page load so cross-device
    // profile updates (name, avatar, etc.) are always reflected.
    api
      .get("/users/profile")
      .then((res) => {
        const userData = res.data.data;
        setUser(userData);
        localStorage.setItem("user", JSON.stringify(userData));
      })
      .catch(() => {
        // Keep the cached user if the request fails (e.g. offline)
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const saveAuth = (userData: User, tokenData: string) => {
    setUser(userData);
    setToken(tokenData);
    localStorage.setItem("token", tokenData);
    localStorage.setItem("user", JSON.stringify(userData));
  };

  const login = async (email: string, password: string) => {
    const res = await api.post("/auth/login", { email, password });
    const data = res.data.data;
    if (data?.requiresEmailVerification) {
      return { requiresEmailVerification: true, email: data.email || email };
    }
    const { user: userData, token: tokenData } = data;
    saveAuth(userData, tokenData);
    return { requiresEmailVerification: false, isAdmin: isAdminUser(userData) };
  };

  const register = async (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) => {
    const res = await api.post("/auth/register", data);
    const responseData = res.data.data;

    return {
      requiresEmailVerification: Boolean(
        responseData?.requiresEmailVerification,
      ),
      user: responseData?.user,
      token: responseData?.token,
    };
  };

  const verifyEmailOtp = async (email: string, otp: string) => {
    await api.post("/auth/verify-email-otp", { email, otp });
  };

  const resendEmailOtp = async (email: string) => {
    await api.post("/auth/resend-email-otp", { email });
  };

  const forgotPassword = async (email: string) => {
    await api.post("/auth/forgot-password", { email });
  };

  const resetPassword = async (
    email: string,
    otp: string,
    newPassword: string,
  ) => {
    await api.post("/auth/reset-password", { email, otp, newPassword });
  };

  const completeGoogleLogin = useCallback(async (tokenData: string) => {
    localStorage.setItem("token", tokenData);
    const response = await api.get("/users/profile", {
      headers: {
        Authorization: `Bearer ${tokenData}`,
      },
    });

    const userData = response.data.data as User;
    saveAuth(userData, tokenData);
    return { isAdmin: isAdminUser(userData) };
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    // Mark this as an intentional logout so layout guards redirect to
    // the landing page rather than /login?redirect=...
    sessionStorage.setItem("explicit_logout", "1");
  }, []);

  // Listen for 401 unauthorized events fired by the API interceptor.
  // Clearing user state here is enough — layout useEffects that watch `user`
  // will handle the client-side redirect via Next.js router (no page reload).
  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setToken(null);
    };
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () =>
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, []);

  const hasRole = useCallback(
    (role: string) => {
      if (!user) return false;
      const normalize = (r: string) => r.replace(/_/g, "").toUpperCase();
      const target = normalize(role);
      return user.userRoles.some((ur) => normalize(ur.role.name) === target);
    },
    [user],
  );

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get("/users/profile");
      const userData = res.data.data;
      setUser(userData);
      localStorage.setItem("user", JSON.stringify(userData));
    } catch {
      const storedUser = localStorage.getItem("user");
      if (storedUser) setUser(JSON.parse(storedUser));
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        verifyEmailOtp,
        resendEmailOtp,
        forgotPassword,
        resetPassword,
        completeGoogleLogin,
        logout,
        hasRole,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
