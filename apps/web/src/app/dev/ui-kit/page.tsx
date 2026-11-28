import { notFound } from 'next/navigation';
import { UiKitPlayground } from '../../../components/dev/UiKitPlayground';

export const dynamic = 'force-dynamic';

export default function DevUiKitPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <UiKitPlayground />;
}
