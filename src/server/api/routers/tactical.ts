import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { MarkerType, RouteType, Faction } from "@prisma/client";

// Input validation schemas
const createMarkerSchema = z.object({
  planId: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  elevation: z.number().optional(),
  type: z.nativeEnum(MarkerType),
  label: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i),
  faction: z.nativeEnum(Faction).optional(),
  metadata: z.record(z.any()).optional(),
});

const createRouteSchema = z.object({
  planId: z.string(),
  name: z.string().min(1).max(100),
  type: z.nativeEnum(RouteType),
  color: z.string().regex(/^#[0-9A-F]{6}$/i),
  points: z.array(z.tuple([z.number(), z.number()])),
  timing: z.string().optional(),
  assignments: z.array(z.string()).optional(),
});

const createPlanSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  isPublic: z.boolean().default(false),
  mapVersion: z.string().optional(),
});

export const tacticalRouter = createTRPCRouter({
  // Plan operations
  createPlan: protectedProcedure
    .input(createPlanSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.operationPlan.create({
        data: {
          ...input,
          userId: ctx.session.user.id,
        },
        include: {
          markers: true,
          routes: true,
          notes: true,
        },
      });
    }),

  getPlans: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.operationPlan.findMany({
      where: {
        OR: [
          { userId: ctx.session.user.id },
          {
            shares: {
              some: { userId: ctx.session.user.id },
            },
          },
        ],
      },
      include: {
        markers: true,
        routes: true,
        notes: true,
        shares: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  }),

  getPlan: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const plan = await ctx.db.operationPlan.findFirst({
        where: {
          id: input.id,
          OR: [
            { userId: ctx.session.user.id },
            {
              shares: {
                some: { userId: ctx.session.user.id },
              },
            },
            { isPublic: true },
          ],
        },
        include: {
          markers: true,
          routes: true,
          notes: true,
          user: { select: { name: true, email: true } },
          shares: {
            include: {
              user: { select: { name: true, email: true } },
            },
          },
        },
      });

      if (!plan) {
        throw new Error("Plan not found or access denied");
      }

      return plan;
    }),

  updatePlan: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        isPublic: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      return ctx.db.operationPlan.update({
        where: {
          id,
          userId: ctx.session.user.id, // Only owner can update plan details
        },
        data: updateData,
      });
    }),

  deletePlan: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.operationPlan.delete({
        where: {
          id: input.id,
          userId: ctx.session.user.id,
        },
      });
    }),

  // Marker operations
  createMarker: protectedProcedure
    .input(createMarkerSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify user has access to the plan
      const plan = await ctx.db.operationPlan.findFirst({
        where: {
          id: input.planId,
          OR: [
            { userId: ctx.session.user.id },
            {
              shares: {
                some: {
                  userId: ctx.session.user.id,
                  canEdit: true,
                },
              },
            },
          ],
        },
      });

      if (!plan) {
        throw new Error("Plan not found or access denied");
      }

      return ctx.db.tacticalMarker.create({
        data: {
          ...input,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        },
      });
    }),

  updateMarker: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        label: z.string().optional(),
        description: z.string().optional(),
        color: z.string().optional(),
        elevation: z.number().optional(),
        isVisible: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Verify access through plan ownership
      const marker = await ctx.db.tacticalMarker.findFirst({
        where: { id },
        include: {
          plan: {
            include: {
              shares: true,
            },
          },
        },
      });

      if (
        !marker ||
        (marker.plan.userId !== ctx.session.user.id &&
          !marker.plan.shares.some(
            (s) => s.userId === ctx.session.user.id && s.canEdit,
          ))
      ) {
        throw new Error("Marker not found or access denied");
      }

      return ctx.db.tacticalMarker.update({
        where: { id },
        data: updateData,
      });
    }),

  deleteMarker: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Similar access verification as updateMarker
      const marker = await ctx.db.tacticalMarker.findFirst({
        where: { id: input.id },
        include: {
          plan: {
            include: {
              shares: true,
            },
          },
        },
      });

      if (
        !marker ||
        (marker.plan.userId !== ctx.session.user.id &&
          !marker.plan.shares.some(
            (s) => s.userId === ctx.session.user.id && s.canEdit,
          ))
      ) {
        throw new Error("Marker not found or access denied");
      }

      return ctx.db.tacticalMarker.delete({
        where: { id: input.id },
      });
    }),

  // Route operations
  createRoute: protectedProcedure
    .input(createRouteSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify plan access
      const plan = await ctx.db.operationPlan.findFirst({
        where: {
          id: input.planId,
          OR: [
            { userId: ctx.session.user.id },
            {
              shares: {
                some: {
                  userId: ctx.session.user.id,
                  canEdit: true,
                },
              },
            },
          ],
        },
      });

      if (!plan) {
        throw new Error("Plan not found or access denied");
      }

      return ctx.db.tacticalRoute.create({
        data: {
          ...input,
          points: JSON.stringify(input.points),
          assignments: input.assignments
            ? JSON.stringify(input.assignments)
            : null,
        },
      });
    }),

  updateRoute: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        color: z.string().optional(),
        points: z.array(z.tuple([z.number(), z.number()])).optional(),
        timing: z.string().optional(),
        assignments: z.array(z.string()).optional(),
        isVisible: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, points, assignments, ...updateData } = input;

      return ctx.db.tacticalRoute.update({
        where: { id },
        data: {
          ...updateData,
          ...(points && { points: JSON.stringify(points) }),
          ...(assignments && { assignments: JSON.stringify(assignments) }),
        },
      });
    }),

  deleteRoute: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.tacticalRoute.delete({
        where: { id: input.id },
      });
    }),

  // Plan sharing
  sharePlan: protectedProcedure
    .input(
      z.object({
        planId: z.string(),
        userEmail: z.string().email(),
        canEdit: z.boolean().default(false),
        canShare: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Find the user to share with
      const targetUser = await ctx.db.user.findUnique({
        where: { email: input.userEmail },
      });

      if (!targetUser) {
        throw new Error("User not found");
      }

      // Verify plan ownership
      const plan = await ctx.db.operationPlan.findFirst({
        where: {
          id: input.planId,
          userId: ctx.session.user.id,
        },
      });

      if (!plan) {
        throw new Error("Plan not found or access denied");
      }

      return ctx.db.planShare.create({
        data: {
          planId: input.planId,
          userId: targetUser.id,
          canEdit: input.canEdit,
          canShare: input.canShare,
        },
      });
    }),

  // Mortar calculations
  calculateMortarSolution: publicProcedure
    .input(
      z.object({
        mortarPos: z.tuple([z.number(), z.number()]),
        mortarElevation: z.number(),
        targetPos: z.tuple([z.number(), z.number()]),
        targetElevation: z.number(),
        faction: z.nativeEnum(Faction),
        shellType: z.enum(["he", "smoke", "illumination", "practice"]),
        chargeRings: z.number().min(0).max(4),
      }),
    )
    .query(async ({ input }) => {
      // Implement actual Arma Reforger ballistic calculations here
      const distance = Math.sqrt(
        Math.pow(input.targetPos[0] - input.mortarPos[0], 2) +
          Math.pow(input.targetPos[1] - input.mortarPos[1], 2),
      );

      const bearing =
        (Math.atan2(
          input.targetPos[1] - input.mortarPos[1],
          input.targetPos[0] - input.mortarPos[0],
        ) *
          180) /
        Math.PI;

      const elevationDiff = input.targetElevation - input.mortarElevation;

      // Convert bearing to mils based on faction
      const milsPerDegree =
        input.faction === Faction.US ? 6400 / 360 : 6000 / 360;
      const bearingMils = Math.round(((bearing + 360) % 360) * milsPerDegree);

      // This would use the actual ballistic tables
      // For now, placeholder calculation
      const baseElevation = 800;
      const distanceCorrection = distance * 0.1;
      const elevationCorrection = elevationDiff * 0.05;
      const chargeCorrection = input.chargeRings * 50;

      const elevation = Math.round(
        baseElevation +
          distanceCorrection +
          elevationCorrection -
          chargeCorrection,
      );
      const timeOfFlight = Math.round(distance * 0.01 + input.chargeRings * 2);

      return {
        distance: Math.round(distance),
        bearing: Math.round((bearing + 360) % 360),
        bearingMils,
        elevation,
        timeOfFlight,
        chargeRings: input.chargeRings,
        faction: input.faction,
        shellType: input.shellType,
        elevationDifference: Math.round(elevationDiff),
      };
    }),
});
