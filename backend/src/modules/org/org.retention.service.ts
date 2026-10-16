import dayjs from "dayjs";
import prisma from "@root/prisma.js";

const INVITE_RETENTION_DAYS = 90;

/**
 * Housekeeping for org data. Deliberately narrow: invitations (which hold an
 * email address and a token hash) are deleted once they are long dead; bills,
 * payments and the audit log are kept they are financial / accountability
 * records.
 */
export async function purgeStaleInvites(now = new Date()) {
  const cutoff = dayjs(now).subtract(INVITE_RETENTION_DAYS, "day").toDate();
  const res = await prisma.orgInvite.deleteMany({
    where: {
      OR: [
        { acceptedAt: { lt: cutoff } },
        { revokedAt: { lt: cutoff } },
        { acceptedAt: null, revokedAt: null, expiresAt: { lt: cutoff } },
      ],
    },
  });
  return res.count;
}
