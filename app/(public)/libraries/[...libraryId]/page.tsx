export default async function Page({ params }: { params: Promise<{ libraryId: string[] }> }) {
  const { libraryId } = await params;
  return (
    <main className="mx-auto max-w-5xl px-6 py-24">
      Library Detail — /{libraryId.join('/')} — scaffold placeholder
    </main>
  );
}
