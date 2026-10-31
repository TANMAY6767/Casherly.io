import prisma from "../prisma/client.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse, statusType } from "../utils/index.js";
const getUserId = (req) => req.user?.sub;


const getAllTeams = asyncHandler(async (req, res) => {

  const userId = getUserId(req);
  const { orgId } = req.params;


  if (!userId) {
    throw new ApiError(statusType.UNAUTHORIZED, "Unauthorized");
  }
  if (!orgId) {
    throw new ApiError(statusType.BAD_REQUEST, "Organization ID is required.");
  }

  const organizationMembership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } },
    select: { role: true },
  });
  if (!organizationMembership) throw new ApiError(statusType.FORBIDDEN, "You are not a member of this organization.");

  const teams = await prisma.team.findMany({
    where: {
      organizationId: orgId,
      ...(organizationMembership.role === "owner" ? {} : { members: { some: { userId } } }),
    },
    orderBy: { createdAt: "desc" },

    select: {
      id: true,
      name: true,
      organizationId: true,
      createdById: true,
      createdAt: true,

      _count: {
        select: {
          members: true,
        },
      },

      members: {
        where: {
          userId,
        },
        select: {
          role: true,
        },
      },
      budget: {
        select: {
          totalBudget: true,
          currency: true
        }
      }
    },
  });

  return sendResponse(
    res,
    "success",
    teams,
    "teams Fetched",
    statusType.OK
  )

});

const getOneTeam = asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { teamId } = req.params;

  if (!userId) {
    throw new ApiError(statusType.UNAUTHORIZED, "Unauthorized");
  }
  if (!teamId) {
    throw new ApiError(statusType.BAD_REQUEST, "Team ID is required.");
  }

  const organizationMembership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: req.params.orgId, userId } },
    select: { role: true },
  });
  if (!organizationMembership) throw new ApiError(statusType.FORBIDDEN, "You are not a member of this organization.");

  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      organizationId: req.params.orgId,
      ...(organizationMembership.role === "owner" ? {} : { members: { some: { userId } } }),
    },

    select: {
      id: true,
      name: true,
      organizationId: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,

      organization: {
        select: {
          id: true,
          name: true,
        },
      },

      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },

      members: {
        select: {
          id: true,
          userId: true,
          role: true,
          joinedAt: true,

          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },

      budget: {
        select: {
          id: true,
          totalBudget: true,
          currency: true,
          createdAt: true,
          updatedAt: true,
        },
      },

      _count: {
        select: {
          members: true,
          transactions: true,
          accounts: true,
        },
      },
    },
  });

  if (!team) {
    throw new ApiError(statusType.NOT_FOUND, "Team not found.");
  }

  return sendResponse(
    res,
    "success",
    team,
    "Team fetched successfully.",
    statusType.OK
  );
});

const createTeam = asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { orgId } = req.params;
  const name = req.body.name?.trim();

  if (!userId) {
    throw new ApiError(
      statusType.UNAUTHORIZED,
      "Unauthorized"
    );
  }

  if (!orgId || !name) {
    throw new ApiError(
      statusType.BAD_REQUEST,
      "Organization ID and team name are required."
    );
  }

  const orgMember = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: orgId,
        userId,
      },
    },
    select: {
      id: true,
      role: true,
    },
  });

  if (!orgMember) {
    throw new ApiError(
      statusType.FORBIDDEN,
      "You are not a member of this organization."
    );
  }

  const existingTeam = await prisma.team.findUnique({
    where: {
      organizationId_name: {
        organizationId: orgId,
        name,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingTeam) {
    throw new ApiError(
      statusType.CONFLICT,
      "A team with this name already exists in this organization."
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const team = await tx.team.create({
      data: {
        name,
        organizationId: orgId,
        createdById: userId,

        members: {
          create: {
            userId,
            role: "owner",
          },
        },
      },
      select: {
        id: true,
        name: true,
        organizationId: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,

        members: {
          select: {
            id: true,
            userId: true,
            role: true,
            joinedAt: true,
          },
        },
      },
    });

    const expenseAccount = await tx.account.create({
      data: {
        organizationId: orgId,
        teamId: team.id,
        accountType: "expense",
        name: `${name} Expense Account`.slice(0, 100),
      },
      select: {
        id: true,
        name: true,
        accountType: true,
        teamId: true,
      },
    });

    return {
      team,
      expenseAccount,
    };
  });

  return sendResponse(
    res,
    "success",
    result,
    "Team created successfully.",
    statusType.CREATED
  );
});

const updateTeam = asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { orgId, teamId } = req.params;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";

  if (!userId) throw new ApiError(statusType.UNAUTHORIZED, "Unauthorized.");
  if (!orgId || !teamId) throw new ApiError(statusType.BAD_REQUEST, "Organization and team IDs are required.");
  if (!name) throw new ApiError(statusType.BAD_REQUEST, "Team name is required.");

  const team = await prisma.team.findFirst({
    where: { id: teamId, organizationId: orgId, createdById: userId },
  });
  if (!team) throw new ApiError(statusType.FORBIDDEN, "Only the team creator can update this team.");

  const updatedTeam = await prisma.team.update({
    where: { id: teamId },
    data: { name },
    select: {
      id: true,
      name: true,
      organizationId: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return sendResponse(res, "success", updatedTeam, "Team updated successfully.", statusType.OK);
});

const deleteTeam = asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { orgId, teamId } = req.params;

  if (!userId) throw new ApiError(statusType.UNAUTHORIZED, "Unauthorized.");
  if (!orgId || !teamId) throw new ApiError(statusType.BAD_REQUEST, "Organization and team IDs are required.");

  const team = await prisma.team.findFirst({
    where: { id: teamId, organizationId: orgId, createdById: userId },
    select: { id: true },
  });
  if (!team) throw new ApiError(statusType.FORBIDDEN, "Only the team creator can delete this team.");

  await prisma.team.delete({ where: { id: teamId } });
  return sendResponse(res, "success", null, "Team deleted successfully.", statusType.OK);
});

const getTeamMembers = asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { teamId } = req.params;

  if (!userId) throw new ApiError(statusType.UNAUTHORIZED, "Unauthorized.");
  if (!teamId) throw new ApiError(statusType.BAD_REQUEST, "Team ID is required.");

  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      OR: [
        { members: { some: { userId } } },
        { organization: { members: { some: { userId, role: "owner" } } } },
      ],
    },
    select: { id: true },
  });
  if (!team) throw new ApiError(statusType.FORBIDDEN, "You do not have access to this team.");

  const members = await prisma.teamMember.findMany({
    where: { teamId },
    orderBy: { joinedAt: "asc" },
    select: {
      id: true,
      userId: true,
      role: true,
      joinedAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return sendResponse(res, "success", members, "Team members fetched successfully.", statusType.OK);
});

const addTeamMember = asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { teamId } = req.params;
  const memberUserId = req.body?.userId;
  const requestedRole = req.body?.role ?? "member";

  if (!userId) throw new ApiError(statusType.UNAUTHORIZED, "Unauthorized.");
  if (!teamId || !memberUserId) throw new ApiError(statusType.BAD_REQUEST, "Team and organization member are required.");
  if (!['member', 'admin'].includes(requestedRole)) throw new ApiError(statusType.BAD_REQUEST, "Invalid team role.");

  const team = await prisma.team.findFirst({
    where: { id: teamId, createdById: userId },
    select: { id: true, organizationId: true },
  });
  if (!team) throw new ApiError(statusType.FORBIDDEN, "Only the team creator can add members.");

  const organizationMember = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: team.organizationId, userId: memberUserId } },
    select: { userId: true },
  });
  if (!organizationMember) throw new ApiError(statusType.BAD_REQUEST, "Add this person to the organization before adding them to a team.");

  const existingMember = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: memberUserId } },
    select: { id: true },
  });
  if (existingMember) throw new ApiError(statusType.CONFLICT, "User is already a member of this team.");

  const member = await prisma.teamMember.create({
    data: { teamId, userId: memberUserId, role: requestedRole },
    select: {
      id: true,
      userId: true,
      role: true,
      joinedAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return sendResponse(res, "success", member, "Team member added successfully.", statusType.OK);
});

const sendTeamInvitationEmail = asyncHandler(async (req, res) => {
  if (!getUserId(req)) throw new ApiError(statusType.UNAUTHORIZED, "Unauthorized.");
  throw new ApiError(
    statusType.BAD_REQUEST,
    "Team email invitations are unavailable in the current database schema. Invite the person to the organization first, then add them to this team."
  );
});

const acceptInvitation = asyncHandler(async (req, res) => {
  if (!getUserId(req)) throw new ApiError(statusType.UNAUTHORIZED, "Unauthorized.");
  throw new ApiError(
    statusType.BAD_REQUEST,
    "Team email invitations are unavailable in the current database schema. Ask the organization owner to add you to the team after you join the organization."
  );
});

const updateTeamMemberRole = asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { teamId, memberUserId } = req.params;
  const { role } = req.body ?? {};

  if (!userId) throw new ApiError(statusType.UNAUTHORIZED, "Unauthorized.");
  if (!teamId || !memberUserId) throw new ApiError(statusType.BAD_REQUEST, "Team and member IDs are required.");
  if (!["member", "admin"].includes(role)) throw new ApiError(statusType.BAD_REQUEST, "Invalid team role.");

  const team = await prisma.team.findFirst({
    where: { id: teamId, createdById: userId },
    select: { id: true, createdById: true },
  });
  if (!team) throw new ApiError(statusType.FORBIDDEN, "Only the team creator can change member roles.");
  if (memberUserId === team.createdById) throw new ApiError(statusType.BAD_REQUEST, "The team creator's role cannot be changed.");

  const member = await prisma.teamMember.update({
    where: { teamId_userId: { teamId, userId: memberUserId } },
    data: { role },
    select: {
      id: true,
      userId: true,
      role: true,
      joinedAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  }).catch((error) => {
    if (error.code === "P2025") throw new ApiError(statusType.NOT_FOUND, "Team member not found.");
    throw error;
  });

  return sendResponse(res, "success", member, "Team member role updated successfully.", statusType.OK);
});


const removeTeamMember = asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { teamId, memberUserId } = req.params;

  if (!userId) throw new ApiError(statusType.UNAUTHORIZED, "Unauthorized.");
  if (!teamId || !memberUserId) throw new ApiError(statusType.BAD_REQUEST, "Team and member IDs are required.");

  const team = await prisma.team.findFirst({
    where: { id: teamId, createdById: userId },
    select: { id: true, createdById: true },
  });
  if (!team) throw new ApiError(statusType.FORBIDDEN, "Only the team creator can remove members.");
  if (memberUserId === team.createdById) throw new ApiError(statusType.BAD_REQUEST, "The team creator cannot be removed.");

  await prisma.teamMember.delete({
    where: { teamId_userId: { teamId, userId: memberUserId } },
  }).catch((error) => {
    if (error.code === "P2025") throw new ApiError(statusType.NOT_FOUND, "Team member not found.");
    throw error;
  });

  return sendResponse(res, "success", null, "Team member removed successfully.", statusType.OK);
});


const createTeamExpenseTransaction = asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { orgId, teamId } = req.params;
  const { transactionType, amount, description } = req.body;
  const categoryInput = typeof req.body.category === "string" ? req.body.category.trim() : "";
  const allowedCategories = new Set(["Travel", "Meals", "Software", "Supplies", "Marketing", "Transport", "Other"]);
  if (categoryInput && !allowedCategories.has(categoryInput)) {
    throw new ApiError(statusType.BAD_REQUEST, "Choose a valid expense category.");
  }

  if (!userId) {
    throw new ApiError(
      statusType.UNAUTHORIZED,
      "Unauthorized."
    );
  }

  if (!orgId || !teamId) {
    throw new ApiError(
      statusType.BAD_REQUEST,
      "Organization and team IDs are required."
    );
  }

  if (
    typeof transactionType !== "string" ||
    transactionType.trim().toUpperCase() !== "EXPENSE"
  ) {
    throw new ApiError(
      statusType.BAD_REQUEST,
      "This endpoint only supports EXPENSE transactions."
    );
  }

  // 4. Validate amount without converting it to a floating-point
  // number for storage.
  const amountString = String(amount ?? "").trim();

  if (
    !/^\d{1,12}(?:\.\d{1,2})?$/.test(amountString) ||
    Number(amountString) <= 0
  ) {
    throw new ApiError(
      statusType.BAD_REQUEST,
      "Amount must be a positive value with at most two decimal places."
    );
  }

  const cleanDescription =
    typeof description === "string"
      ? description.trim()
      : "";

  // 5. Verify that the team belongs to the organization
  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      organizationId: orgId,
    },
    select: {
      id: true,
      organizationId: true,
      budget: { select: { currency: true } },
    },
  });

  if (!team) {
    throw new ApiError(
      statusType.BAD_REQUEST,
      "Team or organization is invalid."
    );
  }

  // 6. Verify organization membership
  const organizationMembership =
    await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId,
        },
      },
      select: {
        role: true,
      },
    });

  if (!organizationMembership) {
    throw new ApiError(
      statusType.FORBIDDEN,
      "You are not a member of this organization."
    );
  }

  // 7. Verify team membership
  // Your Prisma schema defines @@unique([teamId, userId]),
  // so the correct compound key is teamId_userId.
  const teamMembership = await prisma.teamMember.findUnique({
    where: {
      teamId_userId: {
        teamId,
        userId,
      },
    },
    select: {
      role: true,
    },
  });

  if (!teamMembership) {
    throw new ApiError(
      statusType.FORBIDDEN,
      "You are not a member of this team."
    );
  }

  // 8. Create the transaction and both ledger entries atomically
  const result = await prisma.$transaction(async (tx) => {
    // Find the team's existing Expense Account
    const expenseAccount = await tx.account.findFirst({
      where: {
        organizationId: orgId,
        teamId,
        accountType: "expense",
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!expenseAccount) {
      throw new ApiError(
        statusType.BAD_REQUEST,
        "The team's Expense Account was not found."
      );
    }

    // Find the organization's existing Financial Cash Account.
    // Update this name to match the value stored in your database.
    const cashAccount = await tx.account.findFirst({
      where: {
        organizationId: orgId,
        teamId: null,
        accountType: "asset",
        name: {
          equals: "Financial Cash Account",
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!cashAccount) {
      throw new ApiError(
        statusType.BAD_REQUEST,
        "The organization's Financial Cash Account was not found."
      );
    }

    // Debit Expense; credit Cash.
    // Nested creation ensures the transaction and both entries
    // are committed or rolled back together.
    const transaction = await tx.transaction.create({
      data: {
        organizationId: orgId,
        teamId,
        createdById: userId,
        transactionType: "EXPENSE",
        currency: team.budget?.currency || "INR",
        category: categoryInput || null,
        description: cleanDescription || null,

        ledgerEntries: {
          create: [
            {
              accountId: expenseAccount.id,
              debit: amountString,
              credit: "0",
              description: cleanDescription || null,
            },
            {
              accountId: cashAccount.id,
              debit: "0",
              credit: amountString,
              description: cleanDescription || null,
            },
          ],
        },
      },
      select: {
        id: true,
        organizationId: true,
        teamId: true,
        createdById: true,
        transactionType: true,
        currency: true,
        category: true,
        description: true,
        createdAt: true,

        ledgerEntries: {
          select: {
            id: true,
            debit: true,
            credit: true,
            description: true,
            account: {
              select: {
                id: true,
                name: true,
                accountType: true,
              },
            },
          },
        },
      },
    });

    return transaction;
  });

  return res.status(201).json({
    success: true,
    message: "Team expense recorded successfully.",
    data: result,
  });
});

const createReimbursementClaim = asyncHandler(
  async (req, res) => {
    const userId = getUserId(req);
    const { orgId, teamId } = req.params;
    const { amount, description } = req.body;

    // 1. Authentication
    if (!userId) {
      throw new ApiError(
        statusType.UNAUTHORIZED,
        "Unauthorized."
      );
    }

    if (!orgId || !teamId) {
      throw new ApiError(
        statusType.BAD_REQUEST,
        "Organization and team IDs are required."
      );
    }

    // 2. Validate amount for Decimal(12, 2)
    const amountText = String(amount ?? "").trim();

    if (
      !/^\d{1,10}(?:\.\d{1,2})?$/.test(amountText) ||
      !Number.isFinite(Number(amountText)) ||
      Number(amountText) <= 0
    ) {
      throw new ApiError(
        statusType.BAD_REQUEST,
        "Amount must be positive and have at most two decimal places."
      );
    }

    if (
      description !== undefined &&
      description !== null &&
      typeof description !== "string"
    ) {
      throw new ApiError(
        statusType.BAD_REQUEST,
        "Description must be a string."
      );
    }

    const cleanDescription = description?.trim() || null;

    if (cleanDescription && cleanDescription.length > 500) {
      throw new ApiError(
        statusType.BAD_REQUEST,
        "Description cannot exceed 500 characters."
      );
    }

    // 3. Verify that the team belongs to this organization
    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        organizationId: orgId,
      },
      select: {
        id: true,
        budget: { select: { currency: true } },
      },
    });

    if (!team) {
      throw new ApiError(
        statusType.BAD_REQUEST,
        "Team or organization is invalid."
      );
    }

    // 4. Verify organization membership
    const organizationMembership =
      await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: orgId,
            userId,
          },
        },
        select: {
          id: true,
        },
      });

    if (!organizationMembership) {
      throw new ApiError(
        statusType.FORBIDDEN,
        "You are not a member of this organization."
      );
    }

    // 5. Verify team membership
    const teamMembership = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId,
        },
      },
      select: {
        id: true,
      },
    });

    if (!teamMembership) {
      throw new ApiError(
        statusType.FORBIDDEN,
        "You are not a member of this team."
      );
    }

    // 6. Create claim and accounting entries atomically
    const result = await prisma.$transaction(async (tx) => {
      // Find the team's existing Expense Account
      const expenseAccount = await tx.account.findFirst({
        where: {
          organizationId: orgId,
          teamId,
          accountType: "expense",
        },
        select: {
          id: true,
          name: true,
        },
      });

      // Find the organization's Employee Payable Account
      const payableAccount = await tx.account.findFirst({
        where: {
          organizationId: orgId,
          teamId: null,
          accountType: "liability",
          name: "Employee Payable Account",
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (!expenseAccount || !payableAccount) {
        throw new ApiError(
          statusType.BAD_REQUEST,
          "Required Expense or Employee Payable Account was not found."
        );
      }

      // Create reimbursement claim
      const claim = await tx.reimbursementClaim.create({
        data: {
          organizationId: orgId,
          employeeId: userId,
          teamId,
          amount: amountText,
          currency: team.budget?.currency || "INR",
          description: cleanDescription,
          status: "PENDING",
        },
        select: {
          id: true,
          organizationId: true,
          employeeId: true,
          teamId: true,
          amount: true,
          currency: true,
          description: true,
          status: true,
          createdAt: true,
        },
      });

      // Record:
      // Debit  -> Team Expense
      // Credit -> Employee Payable
      const transaction = await tx.transaction.create({
        data: {
          organizationId: orgId,
          teamId,
          createdById: userId,
          transactionType: "REIMBURSEMENT_CLAIM",
          currency: claim.currency,
          description:
            cleanDescription || "Employee reimbursement claim",
          referenceId: claim.id,

          ledgerEntries: {
            create: [
              {
                accountId: expenseAccount.id,
                debit: amountText,
                credit: "0",
                description: cleanDescription,
              },
              {
                accountId: payableAccount.id,
                debit: "0",
                credit: amountText,
                description: cleanDescription,
              },
            ],
          },
        },
        select: {
          id: true,
          transactionType: true,
          referenceId: true,
          createdAt: true,
          ledgerEntries: {
            select: {
              accountId: true,
              debit: true,
              credit: true,
            },
          },
        },
      });

      return {
        claim,
        transaction,
      };
    });

    return res.status(201).json({
      success: true,
      message: "Reimbursement claim submitted successfully.",
      data: result,
    });
  }
);

const getTeamReimbursementClaims = asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { orgId, teamId } = req.params;
  if (!userId) throw new ApiError(statusType.UNAUTHORIZED, "Unauthorized.");
  if (!orgId || !teamId) throw new ApiError(statusType.BAD_REQUEST, "Organization and team IDs are required.");

  const team = await prisma.team.findFirst({
    where: { id: teamId, organizationId: orgId },
    select: { id: true },
  });
  if (!team) throw new ApiError(statusType.NOT_FOUND, "Team not found.");

  const [organizationMember, teamMember] = await Promise.all([
    prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
      select: { role: true },
    }),
    prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { id: true },
    }),
  ]);
  if (!organizationMember || (!teamMember && organizationMember.role !== "owner")) {
    throw new ApiError(statusType.FORBIDDEN, "You do not have access to this team's reimbursement claims.");
  }

  const claims = await prisma.reimbursementClaim.findMany({
    where: {
      organizationId: orgId,
      teamId,
      ...(organizationMember.role === "owner" ? {} : { employeeId: userId }),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      organizationId: true,
      employeeId: true,
      teamId: true,
      amount: true,
      description: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      employee: { select: { id: true, name: true, email: true } },
    },
  });

  return res.status(200).json({ success: true, message: "Reimbursement claims fetched successfully.", data: claims });
});

const payReimbursementClaim = asyncHandler(
  async (req, res) => {
    const userId = getUserId(req);
    const { orgId, claimId } = req.params;

    // 1. Authentication
    if (!userId) {
      throw new ApiError(
        statusType.UNAUTHORIZED,
        "Unauthorized."
      );
    }

    if (!orgId || !claimId) {
      throw new ApiError(
        statusType.BAD_REQUEST,
        "Organization ID and claim ID are required."
      );
    }

    // 2. Verify that the authenticated user is the organization owner.
    // In your current schema, createdById represents the owner.
    const organization = await prisma.organization.findUnique({
      where: {
        id: orgId,
      },
      select: {
        id: true,
        createdById: true,
      },
    });

    if (!organization) {
      throw new ApiError(
        statusType.BAD_REQUEST,
        "Organization not found."
      );
    }

    if (organization.createdById !== userId) {
      throw new ApiError(
        statusType.FORBIDDEN,
        "Only the organization owner can pay reimbursement claims."
      );
    }

    // 3. Perform payout atomically
    const result = await prisma.$transaction(async (tx) => {
      // Fetch the claim from this organization
      const claim = await tx.reimbursementClaim.findFirst({
        where: {
          id: claimId,
          organizationId: orgId,
        },
        select: {
          id: true,
          employeeId: true,
          teamId: true,
          amount: true,
          currency: true,
          description: true,
          status: true,
        },
      });

      if (!claim) {
        throw new ApiError(
          statusType.BAD_REQUEST,
          "Reimbursement claim not found."
        );
      }

      if (claim.status !== "APPROVED") {
        throw new ApiError(
          statusType.BAD_REQUEST,
          "Only approved reimbursement claims can be paid."
        );
      }

      // Find the organization's Employee Payable Account
      const payableAccount = await tx.account.findFirst({
        where: {
          organizationId: orgId,
          teamId: null,
          accountType: "liability",
          name: "Employee Payable Account",
        },
        select: {
          id: true,
        },
      });

      // Find the organization's Financial Cash Account
      const cashAccount = await tx.account.findFirst({
        where: {
          organizationId: orgId,
          teamId: null,
          accountType: "asset",
          name: "Financial cash Account",
        },
        select: {
          id: true,
        },
      });
      console.log("payableAccount: ",payableAccount)
      console.log("cashAccount: ",cashAccount)
      if (!payableAccount || !cashAccount) {
        throw new ApiError(
          statusType.BAD_REQUEST,
          "Required Employee Payable or Financial Cash Account was not found."
        );
      }

      // Claim amount comes from the database, never from req.body.
      const amount = claim.amount.toString();

      // Atomically claim the right to pay this reimbursement.
      // This prevents two concurrent requests from paying it twice.
      const claimUpdate = await tx.reimbursementClaim.updateMany({
        where: {
          id: claim.id,
          organizationId: orgId,
          status: "APPROVED",
        },
        data: {
          status: "PAID",
        },
      });

      if (claimUpdate.count !== 1) {
        throw new ApiError(
          statusType.BAD_REQUEST,
          "This claim has already been paid or is no longer payable."
        );
      }

      // Record:
      // Debit  -> Employee Payable (liability decreases)
      // Credit -> Financial Cash (asset decreases)
      const transaction = await tx.transaction.create({
        data: {
          organizationId: orgId,
          teamId: claim.teamId,
          createdById: userId,
          transactionType: "REIMBURSEMENT_PAYMENT",
          currency: claim.currency,
          description: `Reimbursement payout: ${claim.description || claim.id
            }`,
          referenceId: claim.id,

          ledgerEntries: {
            create: [
              {
                accountId: payableAccount.id,
                debit: amount,
                credit: "0",
                description: "Settle employee reimbursement payable",
              },
              {
                accountId: cashAccount.id,
                debit: "0",
                credit: amount,
                description: "Reimbursement paid to employee",
              },
            ],
          },
        },
        select: {
          id: true,
          transactionType: true,
          referenceId: true,
          createdAt: true,
          ledgerEntries: {
            select: {
              accountId: true,
              debit: true,
              credit: true,
            },
          },
        },
      });

      const updatedClaim = await tx.reimbursementClaim.findUnique({
        where: {
          id: claim.id,
        },
        select: {
          id: true,
          employeeId: true,
          teamId: true,
          amount: true,
          currency: true,
          description: true,
          status: true,
          updatedAt: true,
        },
      });

      return {
        claim: updatedClaim,
        transaction,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Employee reimbursement paid successfully.",
      data: result,
    });
  }
);


const approveReimbursementClaim = asyncHandler(
  async (req, res) => {
    const userId = getUserId(req);
    const { orgId, claimId } = req.params;

    if (!userId) {
      throw new ApiError(
        statusType.UNAUTHORIZED,
        "Unauthorized."
      );
    }

    if (!orgId || !claimId) {
      throw new ApiError(
        statusType.BAD_REQUEST,
        "Organization ID and claim ID are required."
      );
    }

    // Only the organization owner can approve claims.
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, createdById: true },
    });

    if (!organization) {
      throw new ApiError(
        statusType.BAD_REQUEST,
        "Organization not found."
      );
    }

    if (organization.createdById !== userId) {
      throw new ApiError(
        statusType.FORBIDDEN,
        "Only the organization owner can approve reimbursement claims."
      );
    }

    const claim = await prisma.$transaction(async (tx) => {
      const existingClaim =
        await tx.reimbursementClaim.findFirst({
          where: {
            id: claimId,
            organizationId: orgId,
          },
          select: {
            id: true,
            status: true,
          },
        });

      if (!existingClaim) {
        throw new ApiError(
          statusType.BAD_REQUEST,
          "Reimbursement claim not found."
        );
      }

      if (existingClaim.status !== "PENDING") {
        throw new ApiError(
          statusType.BAD_REQUEST,
          `Cannot approve a claim with status ${existingClaim.status}.`
        );
      }

      // Conditional update prevents duplicate approvals.
      const updated = await tx.reimbursementClaim.updateMany({
        where: {
          id: claimId,
          organizationId: orgId,
          status: "PENDING",
        },
        data: {
          status: "APPROVED",
        },
      });

      if (updated.count !== 1) {
        throw new ApiError(
          statusType.BAD_REQUEST,
          "Claim status changed. Please refresh and try again."
        );
      }

      return tx.reimbursementClaim.findUnique({
        where: { id: claimId },
        select: {
          id: true,
          organizationId: true,
          employeeId: true,
          teamId: true,
          amount: true,
          currency: true,
          description: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    return res.status(200).json({
      success: true,
      message: "Reimbursement claim approved successfully.",
      data: claim,
    });
  }
);

const rejectReimbursementClaim = asyncHandler(
  async (req, res) => {
    const userId = getUserId(req);
    const { orgId, claimId } = req.params;

    if (!userId) {
      throw new ApiError(
        statusType.UNAUTHORIZED,
        "Unauthorized."
      );
    }

    if (!orgId || !claimId) {
      throw new ApiError(
        statusType.BAD_REQUEST,
        "Organization ID and claim ID are required."
      );
    }

    // Only the organization owner can reject claims.
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, createdById: true },
    });

    if (!organization) {
      throw new ApiError(
        statusType.BAD_REQUEST,
        "Organization not found."
      );
    }

    if (organization.createdById !== userId) {
      throw new ApiError(
        statusType.FORBIDDEN,
        "Only the organization owner can reject reimbursement claims."
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Find the claim within the requested organization.
      const claim = await tx.reimbursementClaim.findFirst({
        where: {
          id: claimId,
          organizationId: orgId,
        },
        select: {
          id: true,
          organizationId: true,
          employeeId: true,
          teamId: true,
          amount: true,
          currency: true,
          description: true,
          status: true,
        },
      });

      if (!claim) {
        throw new ApiError(
          statusType.BAD_REQUEST,
          "Reimbursement claim not found."
        );
      }

      // Only pending claims can be rejected.
      // An approved claim needs a separate cancellation/reversal workflow.
      if (claim.status !== "PENDING") {
        throw new ApiError(
          statusType.BAD_REQUEST,
          `Cannot reject a claim with status ${claim.status}.`
        );
      }

      // Locate the original accounting transaction created
      // when the reimbursement claim was submitted.
      const originalTransaction =
        await tx.transaction.findFirst({
          where: {
            organizationId: orgId,
            referenceId: claim.id,
            transactionType: "REIMBURSEMENT_CLAIM",
          },
          include: {
            ledgerEntries: true,
          },
        });

      if (
        !originalTransaction ||
        originalTransaction.ledgerEntries.length < 2
      ) {
        throw new ApiError(
          statusType.BAD_REQUEST,
          "The original claim ledger entries were not found. The claim cannot be safely rejected."
        );
      }

      // Atomically transition PENDING -> REJECTED.
      const updated = await tx.reimbursementClaim.updateMany({
        where: {
          id: claim.id,
          organizationId: orgId,
          status: "PENDING",
        },
        data: {
          status: "REJECTED",
        },
      });

      if (updated.count !== 1) {
        throw new ApiError(
          statusType.BAD_REQUEST,
          "Claim status changed. Please refresh and try again."
        );
      }

      // Reverse every original ledger entry.
      // Original debit becomes reversal credit.
      // Original credit becomes reversal debit.
      const reversalTransaction =
        await tx.transaction.create({
          data: {
            organizationId: orgId,
            teamId: claim.teamId,
            createdById: userId,
            transactionType: "REIMBURSEMENT_REJECTION_REVERSAL",
            currency: claim.currency,
            description: `Reversal for rejected reimbursement claim ${claim.id}`,
            referenceId: claim.id,

            ledgerEntries: {
              create: originalTransaction.ledgerEntries.map(
                (entry) => ({
                  accountId: entry.accountId,
                  debit: entry.credit.toString(),
                  credit: entry.debit.toString(),
                  description:
                    `Reversal of reimbursement claim ${claim.id}`,
                })
              ),
            },
          },
          select: {
            id: true,
            transactionType: true,
            referenceId: true,
            createdAt: true,
            ledgerEntries: {
              select: {
                accountId: true,
                debit: true,
                credit: true,
              },
            },
          },
        });

      const updatedClaim =
        await tx.reimbursementClaim.findUnique({
          where: {
            id: claim.id,
          },
          select: {
            id: true,
            employeeId: true,
            teamId: true,
            amount: true,
            description: true,
            status: true,
            updatedAt: true,
          },
        });

      return {
        claim: updatedClaim,
        reversalTransaction,
      };
    });

    return res.status(200).json({
      success: true,
      message:
        "Reimbursement claim rejected and accounting entries reversed successfully.",
      data: result,
    });
  }
);


export {
  getAllTeams,
  getOneTeam,
  createTeam,
  updateTeam,
  deleteTeam,
  getTeamMembers,
  addTeamMember,
  sendTeamInvitationEmail,
  acceptInvitation,
  updateTeamMemberRole,
  removeTeamMember,

  createTeamExpenseTransaction,

  createReimbursementClaim,
  getTeamReimbursementClaims,
  payReimbursementClaim,
  approveReimbursementClaim,
  rejectReimbursementClaim
};
