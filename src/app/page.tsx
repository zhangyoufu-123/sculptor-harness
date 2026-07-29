'use client';

import { useRouter } from 'next/navigation';
import IdeaInput from '@/components/home/idea-input';

export default function Home() {
  const router = useRouter();

  const handleSubmit = (idea: string) => {
    // eslint-disable-next-line no-console
    console.log('Creating project from idea:', idea);
    const projectId = `proj-${Date.now().toString(36)}`;
    router.push(`/project/${projectId}`);
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <h1 className="text-4xl font-bold text-center mb-2">Sculptor</h1>
        <p className="text-gray-500 text-center mb-12">AI 辅助创作工作台</p>
        <IdeaInput onSubmit={handleSubmit} />
      </div>
    </main>
  );
}
