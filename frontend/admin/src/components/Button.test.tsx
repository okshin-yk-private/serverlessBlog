import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('childrenを正しく表示する', () => {
    render(<Button>クリック</Button>);
    expect(screen.getByText('クリック')).toBeInTheDocument();
  });

  it('クリック時にonClickが呼ばれる', async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>クリック</Button>);

    await userEvent.click(screen.getByText('クリック'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('disabled時はクリックできない', async () => {
    const handleClick = vi.fn();
    render(
      <Button onClick={handleClick} disabled>
        クリック
      </Button>
    );

    await userEvent.click(screen.getByText('クリック'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('typeがsubmitの場合、button type="submit"が設定される', () => {
    render(<Button type="submit">送信</Button>);
    const button = screen.getByText('送信');
    expect(button).toHaveAttribute('type', 'submit');
  });

  it('variantがprimaryの場合、適切なクラスが設定される', () => {
    render(<Button variant="primary">プライマリ</Button>);
    const button = screen.getByText('プライマリ');
    expect(button).toHaveClass('bg-blue-600');
  });

  it('variantがsecondaryの場合、適切なクラスが設定される', () => {
    render(<Button variant="secondary">セカンダリ</Button>);
    const button = screen.getByText('セカンダリ');
    expect(button).toHaveClass('bg-gray-200');
  });

  it('variantがdangerの場合、適切なクラスが設定される', () => {
    render(<Button variant="danger">危険</Button>);
    const button = screen.getByText('危険');
    expect(button).toHaveClass('bg-red-600');
  });

  it('disabled属性が正しく設定される', () => {
    render(<Button disabled>無効</Button>);
    const button = screen.getByText('無効');
    expect(button).toBeDisabled();
  });
});
