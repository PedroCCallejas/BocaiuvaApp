import { PublicSeoHead } from '@/components/seo/PublicSeoHead';

export interface ToolSeoHeadProps {
  title: string;
  description: string;
  path: string;
}

export function ToolSeoHead({ title, description, path }: ToolSeoHeadProps) {
  return <PublicSeoHead title={title} description={description} canonicalPath={path} />;
}
