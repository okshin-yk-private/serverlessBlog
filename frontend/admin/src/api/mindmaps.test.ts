import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import * as authUtils from '../utils/auth';
import {
  createMindmap,
  getMindmap,
  listMindmaps,
  updateMindmap,
  deleteMindmap,
  Mindmap,
  MindmapNode,
  CreateMindmapRequest,
  UpdateMindmapRequest,
  ListMindmapsResponse,
  APIError,
} from './mindmaps';

vi.mock('axios');
vi.mock('../utils/auth');

const mockedAxios = vi.mocked(axios, true);
const mockedGetAuthToken = vi.mocked(authUtils.getAuthToken);

describe('mindmaps API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetAuthToken.mockReturnValue('test-auth-token');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const mockNode: MindmapNode = {
    id: 'node-1',
    text: 'ルートノード',
    children: [
      {
        id: 'node-2',
        text: '子ノード1',
        color: '#FF5733',
        children: [],
      },
      {
        id: 'node-3',
        text: '子ノード2',
        linkUrl: 'https://example.com',
        note: '補足テキスト',
        children: [],
      },
    ],
  };

  const mockMindmap: Mindmap = {
    id: 'mindmap-1',
    title: 'テストマインドマップ',
    nodes: mockNode,
    publishStatus: 'draft',
    authorId: 'user-1',
    createdAt: '2026-02-14T00:00:00Z',
    updatedAt: '2026-02-14T00:00:00Z',
  };

  describe('createMindmap', () => {
    const createRequest: CreateMindmapRequest = {
      title: '新しいマインドマップ',
      nodes: mockNode,
      publishStatus: 'draft',
    };

    it('POST /admin/mindmaps を呼び出してマインドマップを作成する', async () => {
      const createdMindmap: Mindmap = {
        ...mockMindmap,
        title: createRequest.title,
      };
      mockedAxios.post.mockResolvedValue({ data: createdMindmap });

      const result = await createMindmap(createRequest);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/admin/mindmaps',
        createRequest,
        {
          headers: {
            Authorization: 'Bearer test-auth-token',
            'Content-Type': 'application/json',
          },
        }
      );
      expect(result).toEqual(createdMindmap);
    });

    it('認証トークンを含めてリクエストする', async () => {
      mockedGetAuthToken.mockReturnValue('another-token');
      mockedAxios.post.mockResolvedValue({ data: mockMindmap });

      await createMindmap(createRequest);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer another-token',
          }),
        })
      );
    });

    it('400エラー（バリデーションエラー）時はエラーをスローする', async () => {
      const error = {
        response: {
          status: 400,
          data: { message: 'Title is required' },
        },
      };
      mockedAxios.post.mockRejectedValue(error);

      await expect(createMindmap(createRequest)).rejects.toMatchObject({
        message: 'Title is required',
        statusCode: 400,
      });
    });

    it('サイズ超過エラーを処理する', async () => {
      const error = {
        response: {
          status: 400,
          data: {
            message: 'Mindmap data exceeds maximum size of 350KB',
          },
        },
      };
      mockedAxios.post.mockRejectedValue(error);

      await expect(createMindmap(createRequest)).rejects.toMatchObject({
        message: 'Mindmap data exceeds maximum size of 350KB',
        statusCode: 400,
      });
    });

    it('ノード数超過エラーを処理する', async () => {
      const error = {
        response: {
          status: 400,
          data: {
            message: 'Mindmap exceeds maximum node count of 500',
          },
        },
      };
      mockedAxios.post.mockRejectedValue(error);

      await expect(createMindmap(createRequest)).rejects.toMatchObject({
        message: 'Mindmap exceeds maximum node count of 500',
        statusCode: 400,
      });
    });

    it('ノートテキスト超過エラーを処理する', async () => {
      const error = {
        response: {
          status: 400,
          data: {
            message: 'Note text exceeds maximum length of 1000 characters',
          },
        },
      };
      mockedAxios.post.mockRejectedValue(error);

      await expect(createMindmap(createRequest)).rejects.toMatchObject({
        message: 'Note text exceeds maximum length of 1000 characters',
        statusCode: 400,
      });
    });

    it('401エラー（認証エラー）時はエラーをスローする', async () => {
      const error = {
        response: {
          status: 401,
          data: { message: 'Unauthorized' },
        },
      };
      mockedAxios.post.mockRejectedValue(error);

      await expect(createMindmap(createRequest)).rejects.toMatchObject({
        message: 'Unauthorized',
        statusCode: 401,
      });
    });

    it('500エラー時はエラーをスローする', async () => {
      const error = {
        response: {
          status: 500,
          data: { message: 'Internal server error' },
        },
      };
      mockedAxios.post.mockRejectedValue(error);

      await expect(createMindmap(createRequest)).rejects.toMatchObject({
        message: 'Internal server error',
        statusCode: 500,
      });
    });
  });

  describe('getMindmap', () => {
    it('GET /admin/mindmaps/{id} を呼び出してマインドマップを取得する', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockMindmap });

      const result = await getMindmap('mindmap-1');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        '/admin/mindmaps/mindmap-1',
        {
          headers: {
            Authorization: 'Bearer test-auth-token',
          },
        }
      );
      expect(result).toEqual(mockMindmap);
    });

    it('404エラー（マインドマップ不存在）時はエラーをスローする', async () => {
      const error = {
        response: {
          status: 404,
          data: { message: 'Mindmap not found' },
        },
      };
      mockedAxios.get.mockRejectedValue(error);

      await expect(getMindmap('non-existent')).rejects.toMatchObject({
        message: 'Mindmap not found',
        statusCode: 404,
      });
    });

    it('認証トークンを含めてリクエストする', async () => {
      mockedGetAuthToken.mockReturnValue('custom-token');
      mockedAxios.get.mockResolvedValue({ data: mockMindmap });

      await getMindmap('mindmap-1');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer custom-token',
          }),
        })
      );
    });
  });

  describe('listMindmaps', () => {
    const mockListResponse: ListMindmapsResponse = {
      items: [mockMindmap],
      count: 1,
    };

    it('GET /admin/mindmaps を呼び出してマインドマップ一覧を取得する', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockListResponse });

      const result = await listMindmaps();

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/admin/mindmaps'),
        {
          headers: {
            Authorization: 'Bearer test-auth-token',
          },
        }
      );
      expect(result).toEqual(mockListResponse);
    });

    it('limitパラメータを含めてリクエストする', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockListResponse });

      await listMindmaps({ limit: 10 });

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.any(Object)
      );
    });

    it('nextTokenパラメータを含めてリクエストする', async () => {
      const responseWithToken: ListMindmapsResponse = {
        ...mockListResponse,
        nextToken: 'next-page-token',
      };
      mockedAxios.get.mockResolvedValue({ data: responseWithToken });

      await listMindmaps({ nextToken: 'some-token' });

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('nextToken=some-token'),
        expect.any(Object)
      );
    });

    it('limitとnextTokenの両方を含めてリクエストする', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockListResponse });

      await listMindmaps({ limit: 20, nextToken: 'page-2' });

      const calledUrl = mockedAxios.get.mock.calls[0][0];
      expect(calledUrl).toContain('limit=20');
      expect(calledUrl).toContain('nextToken=page-2');
    });

    it('limit=0の場合もクエリパラメータに含める', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockListResponse });

      await listMindmaps({ limit: 0 });

      const calledUrl = mockedAxios.get.mock.calls[0][0] as string;
      expect(calledUrl).toContain('limit=0');
    });

    it('パラメータなしの場合はクエリ文字列なしでリクエストする', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockListResponse });

      await listMindmaps();

      const calledUrl = mockedAxios.get.mock.calls[0][0] as string;
      expect(calledUrl).toBe('/admin/mindmaps');
    });

    it('空のレスポンスを処理する', async () => {
      const emptyResponse: ListMindmapsResponse = {
        items: [],
        count: 0,
      };
      mockedAxios.get.mockResolvedValue({ data: emptyResponse });

      const result = await listMindmaps();

      expect(result).toEqual(emptyResponse);
    });

    it('500エラー時はエラーをスローする', async () => {
      const error = {
        response: {
          status: 500,
          data: { message: 'Internal server error' },
        },
      };
      mockedAxios.get.mockRejectedValue(error);

      await expect(listMindmaps()).rejects.toMatchObject({
        message: 'Internal server error',
        statusCode: 500,
      });
    });
  });

  describe('updateMindmap', () => {
    const updateRequest: UpdateMindmapRequest = {
      title: '更新後マインドマップ',
      nodes: mockNode,
    };

    it('PUT /admin/mindmaps/{id} を呼び出してマインドマップを更新する', async () => {
      const updatedMindmap: Mindmap = {
        ...mockMindmap,
        title: '更新後マインドマップ',
        updatedAt: '2026-02-14T12:00:00Z',
      };
      mockedAxios.put.mockResolvedValue({ data: updatedMindmap });

      const result = await updateMindmap('mindmap-1', updateRequest);

      expect(mockedAxios.put).toHaveBeenCalledWith(
        '/admin/mindmaps/mindmap-1',
        updateRequest,
        {
          headers: {
            Authorization: 'Bearer test-auth-token',
            'Content-Type': 'application/json',
          },
        }
      );
      expect(result).toEqual(updatedMindmap);
    });

    it('公開ステータスのみを更新できる', async () => {
      const statusUpdate: UpdateMindmapRequest = {
        publishStatus: 'published',
      };
      const publishedMindmap: Mindmap = {
        ...mockMindmap,
        publishStatus: 'published',
        publishedAt: '2026-02-14T12:00:00Z',
      };
      mockedAxios.put.mockResolvedValue({ data: publishedMindmap });

      const result = await updateMindmap('mindmap-1', statusUpdate);

      expect(mockedAxios.put).toHaveBeenCalledWith(
        '/admin/mindmaps/mindmap-1',
        statusUpdate,
        expect.any(Object)
      );
      expect(result.publishStatus).toBe('published');
      expect(result.publishedAt).toBeDefined();
    });

    it('404エラー（マインドマップ不存在）時はエラーをスローする', async () => {
      const error = {
        response: {
          status: 404,
          data: { message: 'Mindmap not found' },
        },
      };
      mockedAxios.put.mockRejectedValue(error);

      await expect(
        updateMindmap('non-existent', updateRequest)
      ).rejects.toMatchObject({
        message: 'Mindmap not found',
        statusCode: 404,
      });
    });

    it('400エラー（バリデーションエラー）時はエラーをスローする', async () => {
      const error = {
        response: {
          status: 400,
          data: {
            message: 'Mindmap data exceeds maximum size of 350KB',
          },
        },
      };
      mockedAxios.put.mockRejectedValue(error);

      await expect(
        updateMindmap('mindmap-1', updateRequest)
      ).rejects.toMatchObject({
        message: 'Mindmap data exceeds maximum size of 350KB',
        statusCode: 400,
      });
    });

    it('401エラー（認証エラー）時はエラーをスローする', async () => {
      const error = {
        response: {
          status: 401,
          data: { message: 'Unauthorized' },
        },
      };
      mockedAxios.put.mockRejectedValue(error);

      await expect(
        updateMindmap('mindmap-1', updateRequest)
      ).rejects.toMatchObject({
        message: 'Unauthorized',
        statusCode: 401,
      });
    });
  });

  describe('deleteMindmap', () => {
    it('DELETE /admin/mindmaps/{id} を呼び出してマインドマップを削除する', async () => {
      mockedAxios.delete.mockResolvedValue({ status: 204 });

      await deleteMindmap('mindmap-1');

      expect(mockedAxios.delete).toHaveBeenCalledWith(
        '/admin/mindmaps/mindmap-1',
        {
          headers: {
            Authorization: 'Bearer test-auth-token',
          },
        }
      );
    });

    it('404エラー（マインドマップ不存在）時はエラーをスローする', async () => {
      const error = {
        response: {
          status: 404,
          data: { message: 'Mindmap not found' },
        },
      };
      mockedAxios.delete.mockRejectedValue(error);

      await expect(deleteMindmap('non-existent')).rejects.toMatchObject({
        message: 'Mindmap not found',
        statusCode: 404,
      });
    });

    it('認証トークンを含めてリクエストする', async () => {
      mockedGetAuthToken.mockReturnValue('delete-token');
      mockedAxios.delete.mockResolvedValue({ status: 204 });

      await deleteMindmap('mindmap-1');

      expect(mockedAxios.delete).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer delete-token',
          }),
        })
      );
    });
  });

  describe('APIError型のexport', () => {
    it('APIError型がexportされている', () => {
      const error: APIError = { message: 'test', statusCode: 400 };
      expect(error.message).toBe('test');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('エラーハンドリング', () => {
    it('レスポンスにmessageがない場合はデフォルトメッセージを使用する', async () => {
      const error = {
        response: {
          status: 500,
          data: {},
        },
      };
      mockedAxios.get.mockRejectedValue(error);

      await expect(getMindmap('mindmap-1')).rejects.toMatchObject({
        message: 'エラーが発生しました',
        statusCode: 500,
      });
    });

    it('response自体がない場合（ネットワークエラー）を処理する', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network Error'));

      await expect(getMindmap('mindmap-1')).rejects.toMatchObject({
        message: 'ネットワークエラーが発生しました。接続を確認してください。',
        statusCode: 0,
      });
    });
  });
});
