/**
 * Mock Data for E2E Tests
 *
 * PlaywrightE2Eテスト用のモックデータ
 *
 * Requirements:
 * - R44: テストデータ管理
 */

import { v4 as uuidv4 } from 'uuid';

export interface MockPost {
  id: string;
  title: string;
  contentMarkdown: string;
  contentHtml: string;
  category: string;
  tags?: string[];
  publishStatus: 'draft' | 'published';
  authorId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  imageUrls?: string[];
}

/**
 * モック記事データの生成
 */
export const createMockPost = (
  overrides: Partial<MockPost> = {}
): MockPost => {
  const now = new Date().toISOString();

  return {
    id: uuidv4(),
    title: 'Test Article Title',
    contentMarkdown: '# Test Content\n\nThis is test content in markdown format.',
    contentHtml: '<h1>Test Content</h1><p>This is test content in markdown format.</p>',
    category: 'technology',
    tags: ['test', 'sample'],
    publishStatus: 'published',
    authorId: 'test-author-id',
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
    imageUrls: [],
    ...overrides,
  };
};

/**
 * 初期モック記事データ
 */
export let mockPosts: MockPost[] = [
  createMockPost({
    id: 'post-1',
    title: 'Getting Started with Serverless',
    contentMarkdown:
      '# Getting Started with Serverless\n\nServerless architecture is revolutionizing cloud computing...',
    contentHtml:
      '<h1>Getting Started with Serverless</h1><p>Serverless architecture is revolutionizing cloud computing...</p>',
    category: 'technology',
    tags: ['serverless', 'aws', 'cloud'],
    publishStatus: 'published',
    publishedAt: '2024-01-15T10:00:00Z',
    createdAt: '2024-01-15T09:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  }),
  createMockPost({
    id: 'post-2',
    title: 'Introduction to TypeScript',
    contentMarkdown:
      '# Introduction to TypeScript\n\nTypeScript adds static typing to JavaScript...',
    contentHtml:
      '<h1>Introduction to TypeScript</h1><p>TypeScript adds static typing to JavaScript...</p>',
    category: 'technology',
    tags: ['typescript', 'javascript', 'programming'],
    publishStatus: 'published',
    publishedAt: '2024-01-14T10:00:00Z',
    createdAt: '2024-01-14T09:00:00Z',
    updatedAt: '2024-01-14T10:00:00Z',
  }),
  createMockPost({
    id: 'post-3',
    title: 'Healthy Living Tips',
    contentMarkdown:
      '# Healthy Living Tips\n\nMaintaining a healthy lifestyle is essential...',
    contentHtml:
      '<h1>Healthy Living Tips</h1><p>Maintaining a healthy lifestyle is essential...</p>',
    category: 'life',
    tags: ['health', 'wellness', 'lifestyle'],
    publishStatus: 'published',
    publishedAt: '2024-01-13T10:00:00Z',
    createdAt: '2024-01-13T09:00:00Z',
    updatedAt: '2024-01-13T10:00:00Z',
  }),
  createMockPost({
    id: 'post-4',
    title: 'Draft: Upcoming Feature',
    contentMarkdown: '# Upcoming Feature\n\nThis is a draft article...',
    contentHtml: '<h1>Upcoming Feature</h1><p>This is a draft article...</p>',
    category: 'technology',
    tags: ['draft', 'preview'],
    publishStatus: 'draft',
    createdAt: '2024-01-12T09:00:00Z',
    updatedAt: '2024-01-12T09:30:00Z',
  }),
  createMockPost({
    id: 'post-5',
    title: 'Business Strategy 101',
    contentMarkdown:
      '# Business Strategy 101\n\nUnderstanding business strategy fundamentals...',
    contentHtml:
      '<h1>Business Strategy 101</h1><p>Understanding business strategy fundamentals...</p>',
    category: 'business',
    tags: ['business', 'strategy', 'management'],
    publishStatus: 'published',
    publishedAt: '2024-01-11T10:00:00Z',
    createdAt: '2024-01-11T09:00:00Z',
    updatedAt: '2024-01-11T10:00:00Z',
  }),
  createMockPost({
    id: 'post-6',
    title: 'AWS CDK Best Practices',
    contentMarkdown:
      '# AWS CDK Best Practices\n\nLearn the best practices for AWS CDK development...',
    contentHtml:
      '<h1>AWS CDK Best Practices</h1><p>Learn the best practices for AWS CDK development...</p>',
    category: 'technology',
    tags: ['aws', 'cdk', 'infrastructure'],
    publishStatus: 'published',
    publishedAt: '2024-01-10T10:00:00Z',
    createdAt: '2024-01-10T09:00:00Z',
    updatedAt: '2024-01-10T10:00:00Z',
  }),
  createMockPost({
    id: 'post-7',
    title: 'Draft: Testing Strategies',
    contentMarkdown: '# Testing Strategies\n\nThis is a draft about testing...',
    contentHtml: '<h1>Testing Strategies</h1><p>This is a draft about testing...</p>',
    category: 'technology',
    tags: ['testing', 'tdd', 'draft'],
    publishStatus: 'draft',
    createdAt: '2024-01-09T09:00:00Z',
    updatedAt: '2024-01-09T09:30:00Z',
  }),
  createMockPost({
    id: 'post-8',
    title: 'React Hooks Deep Dive',
    contentMarkdown: '# React Hooks Deep Dive\n\nExploring advanced React Hooks patterns...',
    contentHtml: '<h1>React Hooks Deep Dive</h1><p>Exploring advanced React Hooks patterns...</p>',
    category: 'technology',
    tags: ['react', 'hooks', 'javascript'],
    publishStatus: 'published',
    publishedAt: '2024-01-08T10:00:00Z',
    createdAt: '2024-01-08T09:00:00Z',
    updatedAt: '2024-01-08T10:00:00Z',
  }),
  createMockPost({
    id: 'post-9',
    title: 'Database Design Patterns',
    contentMarkdown: '# Database Design Patterns\n\nBest practices for database schema design...',
    contentHtml: '<h1>Database Design Patterns</h1><p>Best practices for database schema design...</p>',
    category: 'technology',
    tags: ['database', 'design', 'sql'],
    publishStatus: 'published',
    publishedAt: '2024-01-07T10:00:00Z',
    createdAt: '2024-01-07T09:00:00Z',
    updatedAt: '2024-01-07T10:00:00Z',
  }),
  createMockPost({
    id: 'post-10',
    title: 'Microservices Architecture',
    contentMarkdown: '# Microservices Architecture\n\nUnderstanding microservices design principles...',
    contentHtml: '<h1>Microservices Architecture</h1><p>Understanding microservices design principles...</p>',
    category: 'technology',
    tags: ['microservices', 'architecture', 'devops'],
    publishStatus: 'published',
    publishedAt: '2024-01-06T10:00:00Z',
    createdAt: '2024-01-06T09:00:00Z',
    updatedAt: '2024-01-06T10:00:00Z',
  }),
  createMockPost({
    id: 'post-11',
    title: 'GraphQL vs REST',
    contentMarkdown: '# GraphQL vs REST\n\nComparing GraphQL and REST API design...',
    contentHtml: '<h1>GraphQL vs REST</h1><p>Comparing GraphQL and REST API design...</p>',
    category: 'technology',
    tags: ['graphql', 'rest', 'api'],
    publishStatus: 'published',
    publishedAt: '2024-01-05T10:00:00Z',
    createdAt: '2024-01-05T09:00:00Z',
    updatedAt: '2024-01-05T10:00:00Z',
  }),
  createMockPost({
    id: 'post-12',
    title: 'Docker Containers 101',
    contentMarkdown: '# Docker Containers 101\n\nGetting started with Docker containers...',
    contentHtml: '<h1>Docker Containers 101</h1><p>Getting started with Docker containers...</p>',
    category: 'technology',
    tags: ['docker', 'containers', 'devops'],
    publishStatus: 'published',
    publishedAt: '2024-01-04T10:00:00Z',
    createdAt: '2024-01-04T09:00:00Z',
    updatedAt: '2024-01-04T10:00:00Z',
  }),
  createMockPost({
    id: 'post-13',
    title: 'CI/CD Best Practices',
    contentMarkdown: '# CI/CD Best Practices\n\nImplementing effective CI/CD pipelines...',
    contentHtml: '<h1>CI/CD Best Practices</h1><p>Implementing effective CI/CD pipelines...</p>',
    category: 'technology',
    tags: ['cicd', 'automation', 'devops'],
    publishStatus: 'published',
    publishedAt: '2024-01-03T10:00:00Z',
    createdAt: '2024-01-03T09:00:00Z',
    updatedAt: '2024-01-03T10:00:00Z',
  }),
];

/**
 * 特定のモック記事を取得
 */
export const mockPost = mockPosts[0];

/**
 * モックデータをリセット
 */
export const resetMockPosts = () => {
  mockPosts = [
    createMockPost({
      id: 'post-1',
      title: 'Getting Started with Serverless',
      contentMarkdown:
        '# Getting Started with Serverless\n\nServerless architecture is revolutionizing cloud computing...',
      contentHtml:
        '<h1>Getting Started with Serverless</h1><p>Serverless architecture is revolutionizing cloud computing...</p>',
      category: 'technology',
      tags: ['serverless', 'aws', 'cloud'],
      publishStatus: 'published',
      publishedAt: '2024-01-15T10:00:00Z',
      createdAt: '2024-01-15T09:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z',
    }),
    createMockPost({
      id: 'post-2',
      title: 'Introduction to TypeScript',
      contentMarkdown:
        '# Introduction to TypeScript\n\nTypeScript adds static typing to JavaScript...',
      contentHtml:
        '<h1>Introduction to TypeScript</h1><p>TypeScript adds static typing to JavaScript...</p>',
      category: 'technology',
      tags: ['typescript', 'javascript', 'programming'],
      publishStatus: 'published',
      publishedAt: '2024-01-14T10:00:00Z',
      createdAt: '2024-01-14T09:00:00Z',
      updatedAt: '2024-01-14T10:00:00Z',
    }),
    createMockPost({
      id: 'post-3',
      title: 'Healthy Living Tips',
      contentMarkdown:
        '# Healthy Living Tips\n\nMaintaining a healthy lifestyle is essential...',
      contentHtml:
        '<h1>Healthy Living Tips</h1><p>Maintaining a healthy lifestyle is essential...</p>',
      category: 'life',
      tags: ['health', 'wellness', 'lifestyle'],
      publishStatus: 'published',
      publishedAt: '2024-01-13T10:00:00Z',
      createdAt: '2024-01-13T09:00:00Z',
      updatedAt: '2024-01-13T10:00:00Z',
    }),
    createMockPost({
      id: 'post-4',
      title: 'Draft: Upcoming Feature',
      contentMarkdown: '# Upcoming Feature\n\nThis is a draft article...',
      contentHtml: '<h1>Upcoming Feature</h1><p>This is a draft article...</p>',
      category: 'technology',
      tags: ['draft', 'preview'],
      publishStatus: 'draft',
      createdAt: '2024-01-12T09:00:00Z',
      updatedAt: '2024-01-12T09:30:00Z',
    }),
    createMockPost({
      id: 'post-5',
      title: 'Business Strategy 101',
      contentMarkdown:
        '# Business Strategy 101\n\nUnderstanding business strategy fundamentals...',
      contentHtml:
        '<h1>Business Strategy 101</h1><p>Understanding business strategy fundamentals...</p>',
      category: 'business',
      tags: ['business', 'strategy', 'management'],
      publishStatus: 'published',
      publishedAt: '2024-01-11T10:00:00Z',
      createdAt: '2024-01-11T09:00:00Z',
      updatedAt: '2024-01-11T10:00:00Z',
    }),
    createMockPost({
      id: 'post-6',
      title: 'AWS CDK Best Practices',
      contentMarkdown:
        '# AWS CDK Best Practices\n\nLearn the best practices for AWS CDK development...',
      contentHtml:
        '<h1>AWS CDK Best Practices</h1><p>Learn the best practices for AWS CDK development...</p>',
      category: 'technology',
      tags: ['aws', 'cdk', 'infrastructure'],
      publishStatus: 'published',
      publishedAt: '2024-01-10T10:00:00Z',
      createdAt: '2024-01-10T09:00:00Z',
      updatedAt: '2024-01-10T10:00:00Z',
    }),
    createMockPost({
      id: 'post-7',
      title: 'Draft: Testing Strategies',
      contentMarkdown: '# Testing Strategies\n\nThis is a draft about testing...',
      contentHtml: '<h1>Testing Strategies</h1><p>This is a draft about testing...</p>',
      category: 'technology',
      tags: ['testing', 'tdd', 'draft'],
      publishStatus: 'draft',
      createdAt: '2024-01-09T09:00:00Z',
      updatedAt: '2024-01-09T09:30:00Z',
    }),
    createMockPost({
      id: 'post-8',
      title: 'React Hooks Deep Dive',
      contentMarkdown: '# React Hooks Deep Dive\n\nExploring advanced React Hooks patterns...',
      contentHtml: '<h1>React Hooks Deep Dive</h1><p>Exploring advanced React Hooks patterns...</p>',
      category: 'technology',
      tags: ['react', 'hooks', 'javascript'],
      publishStatus: 'published',
      publishedAt: '2024-01-08T10:00:00Z',
      createdAt: '2024-01-08T09:00:00Z',
      updatedAt: '2024-01-08T10:00:00Z',
    }),
    createMockPost({
      id: 'post-9',
      title: 'Database Design Patterns',
      contentMarkdown: '# Database Design Patterns\n\nBest practices for database schema design...',
      contentHtml: '<h1>Database Design Patterns</h1><p>Best practices for database schema design...</p>',
      category: 'technology',
      tags: ['database', 'design', 'sql'],
      publishStatus: 'published',
      publishedAt: '2024-01-07T10:00:00Z',
      createdAt: '2024-01-07T09:00:00Z',
      updatedAt: '2024-01-07T10:00:00Z',
    }),
    createMockPost({
      id: 'post-10',
      title: 'Microservices Architecture',
      contentMarkdown: '# Microservices Architecture\n\nUnderstanding microservices design principles...',
      contentHtml: '<h1>Microservices Architecture</h1><p>Understanding microservices design principles...</p>',
      category: 'technology',
      tags: ['microservices', 'architecture', 'devops'],
      publishStatus: 'published',
      publishedAt: '2024-01-06T10:00:00Z',
      createdAt: '2024-01-06T09:00:00Z',
      updatedAt: '2024-01-06T10:00:00Z',
    }),
    createMockPost({
      id: 'post-11',
      title: 'GraphQL vs REST',
      contentMarkdown: '# GraphQL vs REST\n\nComparing GraphQL and REST API design...',
      contentHtml: '<h1>GraphQL vs REST</h1><p>Comparing GraphQL and REST API design...</p>',
      category: 'technology',
      tags: ['graphql', 'rest', 'api'],
      publishStatus: 'published',
      publishedAt: '2024-01-05T10:00:00Z',
      createdAt: '2024-01-05T09:00:00Z',
      updatedAt: '2024-01-05T10:00:00Z',
    }),
    createMockPost({
      id: 'post-12',
      title: 'Docker Containers 101',
      contentMarkdown: '# Docker Containers 101\n\nGetting started with Docker containers...',
      contentHtml: '<h1>Docker Containers 101</h1><p>Getting started with Docker containers...</p>',
      category: 'technology',
      tags: ['docker', 'containers', 'devops'],
      publishStatus: 'published',
      publishedAt: '2024-01-04T10:00:00Z',
      createdAt: '2024-01-04T09:00:00Z',
      updatedAt: '2024-01-04T10:00:00Z',
    }),
    createMockPost({
      id: 'post-13',
      title: 'CI/CD Best Practices',
      contentMarkdown: '# CI/CD Best Practices\n\nImplementing effective CI/CD pipelines...',
      contentHtml: '<h1>CI/CD Best Practices</h1><p>Implementing effective CI/CD pipelines...</p>',
      category: 'technology',
      tags: ['cicd', 'automation', 'devops'],
      publishStatus: 'published',
      publishedAt: '2024-01-03T10:00:00Z',
      createdAt: '2024-01-03T09:00:00Z',
      updatedAt: '2024-01-03T10:00:00Z',
    }),
  ];
};
