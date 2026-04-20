import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Board role rank — higher = more privileged.
 * Used to check write access without repeating boilerplate everywhere.
 */
const ROLE_RANK: Record<string, number> = {
  owner: 3,
  editor: 2,
  member: 2,
  viewer: 1,
};

export interface BoardAccess {
  boardId: number;
  userId: number;
  role: "owner" | "editor" | "viewer";
  isOwner: boolean;
}

/** Returns the user's access level on a board, or null if no access. */
export async function getBoardAccess(
  boardId: number,
  userId: number,
): Promise<BoardAccess | null> {
  const board = await prisma.taskBoard.findUnique({
    where: { id: boardId },
    select: { ownerId: true },
  });
  if (!board) return null;

  if (board.ownerId === userId) {
    return { boardId, userId, role: "owner", isOwner: true };
  }
  const member = await prisma.taskBoardMember.findUnique({
    where: { boardId_userId: { boardId, userId } },
    select: { role: true },
  });
  if (!member) return null;
  const role = (member.role as "owner" | "editor" | "viewer") || "viewer";
  return { boardId, userId, role, isOwner: false };
}

export async function requireBoardAccess(
  boardId: number,
  userId: number,
  minRole: "owner" | "editor" | "viewer" = "viewer",
): Promise<BoardAccess> {
  const access = await getBoardAccess(boardId, userId);
  if (!access) {
    const err = new Error("لست عضواً في هذه اللوحة") as Error & {
      status: number;
    };
    err.status = 403;
    throw err;
  }
  if (ROLE_RANK[access.role] < ROLE_RANK[minRole]) {
    const err = new Error("ليس لديك الصلاحية المطلوبة على اللوحة") as Error & {
      status: number;
    };
    err.status = 403;
    throw err;
  }
  return access;
}

/** Conversation membership check. Returns participant row or null. */
export async function getConversationAccess(
  conversationId: number,
  userId: number,
) {
  return prisma.chatParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
}

export async function requireConversationAccess(
  conversationId: number,
  userId: number,
) {
  const part = await getConversationAccess(conversationId, userId);
  if (!part || part.leftAt) {
    const err = new Error("لست عضواً في هذه المحادثة") as Error & {
      status: number;
    };
    err.status = 403;
    throw err;
  }
  return part;
}
