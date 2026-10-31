import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import multer from "multer";
import cookieParser from "cookie-parser";
import userRoutes from "./routes/user.routes.js"
import teamRoutes from "./routes/team.routes.js"
import orgRoutes from "./routes/organization.routes.js"
import budgetRoutes from "./routes/budget.routes.js"
import transactionRoutes from "./routes/transaction.routes.js"
import reimbursementRoutes from "./routes/reimbursement.routes.js"
import auditLogRoutes from "./routes/auditLogs.routes.js"
import aiAnalyticsRoutes from "./routes/aiAnalytics.routes.js"
import accountRoutes from "./routes/account.routes.js"
import { ApiError } from "./utils/ApiError.js";
dotenv.config();
const PORT = process.env.PORT || 3000;
const app = express();
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({extended:false}));
app.use(cookieParser());
app.use(multer().none());
app.get("/",(req, res) => {
    res.send("hello tanmay");
})
app.use("/users", userRoutes);
app.use("/org", orgRoutes);
app.use("/", teamRoutes);
app.use("/teams", budgetRoutes);
app.use("/teams", accountRoutes);
app.use("/", transactionRoutes);
app.use("/", reimbursementRoutes);
app.use("/audit-logs", auditLogRoutes);
app.use("/org", aiAnalyticsRoutes);

app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);

    const statusCode = error instanceof ApiError
        ? error.statusCode
        : Number.isInteger(error.statusCode) ? error.statusCode : 500;

    if (statusCode >= 500) {
        console.error(error);
    }

    res.status(statusCode).json({
        status: "error",
        data: null,
        message: error instanceof ApiError
            ? error.message
            : "Something went wrong. Please try again.",
        statusCode,
        apiVersion: "No Version",
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
