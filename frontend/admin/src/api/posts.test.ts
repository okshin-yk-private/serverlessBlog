import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import axios from 'axios';
import { server } from '../test/mocks/server';
import { MAX_IMAGE_BYTES } from '../utils/imageValidation';
import { getUploadUrl, uploadImage } from './posts';

// getUploadUrl goes through apiClient (JSON body) so MSW can intercept it
// directly. The S3 leg of uploadImage posts multipart/form-data containing a
// File; MSW's Node request interceptor cannot parse a jsdom File/Blob inside
// FormData (a jsdom/undici cross-realm gap, unrelated to this feature), so
// that leg is tested by spying on axios.post instead of a real MSW handler.
const UPLOAD_URL_ENDPOINT = 'http://localhost:3000/admin/images/upload-url';
const MOCK_S3_URL = 'https://mock-images-bucket.s3.us-east-1.amazonaws.com/';

const makeFile = (
  size: number,
  type = 'image/png',
  name = 'test.png'
): File => {
  return new File([new Uint8Array(size)], name, { type });
};

const mockUploadUrlHandler = (
  fields: Record<string, string> = { key: 'user-1/uuid.png', policy: 'p' }
) =>
  http.post(UPLOAD_URL_ENDPOINT, () => {
    return HttpResponse.json({
      uploadUrl: MOCK_S3_URL,
      fields,
      key: 'user-1/uuid.png',
      url: 'https://mock-cdn.example.com/images/user-1/uuid.png',
    });
  });

afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});

describe('getUploadUrl', () => {
  it('maps the backend response (url -> imageUrl) and passes fields through', async () => {
    server.use(mockUploadUrlHandler());

    const result = await getUploadUrl('test.png', 'image/png');

    expect(result.uploadUrl).toBe(MOCK_S3_URL);
    expect(result.fields).toEqual({ key: 'user-1/uuid.png', policy: 'p' });
    expect(result.imageUrl).toBe(
      'https://mock-cdn.example.com/images/user-1/uuid.png'
    );
  });
});

describe('uploadImage', () => {
  it('rejects an oversize file before requesting an upload URL', async () => {
    let uploadUrlCalled = false;
    server.use(
      http.post(UPLOAD_URL_ENDPOINT, () => {
        uploadUrlCalled = true;
        return HttpResponse.json({}, { status: 500 });
      })
    );

    const oversized = makeFile(MAX_IMAGE_BYTES + 1);

    await expect(uploadImage(oversized)).rejects.toThrow(
      'ファイルサイズは 5MB 以下にしてください'
    );
    expect(uploadUrlCalled).toBe(false);
  });

  it('accepts a file at exactly the 5MB limit', async () => {
    server.use(mockUploadUrlHandler());
    const postSpy = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ status: 204, data: null });

    const exact = makeFile(MAX_IMAGE_BYTES);
    await expect(uploadImage(exact)).resolves.toBe(
      'https://mock-cdn.example.com/images/user-1/uuid.png'
    );
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('builds FormData with every policy field before the file, and the file last, with no manual Content-Type header', async () => {
    const fields = {
      key: 'user-1/uuid.png',
      policy: 'base64policy',
      'x-amz-signature': 'sig',
      'x-amz-credential': 'cred',
    };
    server.use(mockUploadUrlHandler(fields));
    const postSpy = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ status: 204, data: null });

    const file = makeFile(1024);
    await uploadImage(file);

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledBody, calledConfig] = postSpy.mock.calls[0];
    expect(calledUrl).toBe(MOCK_S3_URL);
    expect(calledBody).toBeInstanceOf(FormData);

    const formData = calledBody as FormData;
    const entries = [...formData.entries()];
    expect(entries.length).toBe(Object.keys(fields).length + 1);
    // The file field must be last (S3 requires this ordering).
    expect(entries[entries.length - 1][0]).toBe('file');
    expect(entries[entries.length - 1][1]).toBe(file);
    // All policy fields precede it, in the order they were appended.
    expect(entries.slice(0, -1).map(([k]) => k)).toEqual(Object.keys(fields));

    // Content-Type must not be set manually so axios/the browser can add the
    // multipart boundary automatically.
    expect(calledConfig?.headers?.['Content-Type']).toBeUndefined();
  });

  it('surfaces a clear Japanese message for S3 EntityTooLarge (400) responses', async () => {
    server.use(mockUploadUrlHandler());
    const entityTooLargeError = Object.assign(new Error('Request failed'), {
      isAxiosError: true,
      response: {
        status: 400,
        data: '<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>EntityTooLarge</Code><Message>Your proposed upload exceeds the maximum allowed size</Message></Error>',
      },
    });
    vi.spyOn(axios, 'post').mockRejectedValue(entityTooLargeError);
    vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);

    await expect(uploadImage(makeFile(1024))).rejects.toThrow(
      'ファイルサイズは 5MB 以下にしてください'
    );
  });

  it('rethrows other S3 errors unchanged', async () => {
    server.use(mockUploadUrlHandler());
    const accessDeniedError = Object.assign(new Error('Request failed'), {
      isAxiosError: true,
      response: {
        status: 403,
        data: '<Error><Code>AccessDenied</Code></Error>',
      },
    });
    vi.spyOn(axios, 'post').mockRejectedValue(accessDeniedError);
    vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);

    await expect(uploadImage(makeFile(1024))).rejects.toBe(accessDeniedError);
  });
});
