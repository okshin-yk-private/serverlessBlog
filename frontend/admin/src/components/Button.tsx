import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  disabled = false,
  type = 'button',
  className,
  ...restProps
}) => {
  // 公開サイトと共通のデザイントークンで定義した admin-btn プリミティブを使う
  const baseClass = 'admin-btn';

  const variantClasses = {
    primary: 'admin-btn-primary',
    secondary: 'admin-btn-secondary',
    danger: 'admin-btn-danger',
  };

  return (
    <button
      type={type}
      className={`${baseClass} ${variantClasses[variant]} ${className ?? ''}`}
      disabled={disabled}
      {...restProps}
    >
      {children}
    </button>
  );
};
