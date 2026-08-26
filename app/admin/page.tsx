import { redirect } from 'next/navigation';
import { currentAdminSession } from '@/lib/http/admin';

/**
 * `/admin` is an alias for the console's first screen.
 *
 * It resolves the admin session itself rather than bouncing through
 * `/admin/overview` and letting that redirect again: an anonymous visitor
 * should land on the sign-in in one hop, not two.
 */
export default async function AdminIndexPage() {
  const session = await currentAdminSession();
  redirect(session ? '/admin/overview' : '/admin/login');
}
