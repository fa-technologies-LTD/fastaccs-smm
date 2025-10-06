import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';

// GET /api/orders/stats - Get order statistics for admin dashboard
export async function GET() {
	try {
		// Get order counts by status
		const [totalOrders, pendingOrders, processingOrders, completedOrders, failedOrders] =
			await Promise.all([
				prisma.order.count(),
				prisma.order.count({ where: { status: 'pending' } }),
				prisma.order.count({ where: { status: 'processing' } }),
				prisma.order.count({ where: { status: 'completed' } }),
				prisma.order.count({ where: { status: 'failed' } })
			]);

		// Get today's orders (since midnight)
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const todaysOrders = await prisma.order.count({
			where: {
				createdAt: {
					gte: today
				}
			}
		});

		// Get revenue data
		const revenueData = await prisma.order.aggregate({
			_sum: {
				totalAmount: true
			},
			where: {
				status: 'completed'
			}
		});

		const todaysRevenueData = await prisma.order.aggregate({
			_sum: {
				totalAmount: true
			},
			where: {
				status: 'completed',
				createdAt: {
					gte: today
				}
			}
		});

		const stats = {
			total_orders: totalOrders,
			pending_orders: pendingOrders,
			processing_orders: processingOrders,
			completed_orders: completedOrders,
			failed_orders: failedOrders,
			todays_orders: todaysOrders,
			total_revenue: Number(revenueData._sum.totalAmount || 0),
			todays_revenue: Number(todaysRevenueData._sum.totalAmount || 0)
		};

		return json({ data: stats, error: null });
	} catch (error) {
		console.error('Failed to get order statistics:', error);
		return json({ data: null, error: 'Failed to get order statistics' }, { status: 500 });
	}
}
