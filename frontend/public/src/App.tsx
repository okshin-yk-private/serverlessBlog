import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import PostListPage from './pages/PostListPage';
import PostDetailPage from './pages/PostDetailPage';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<PostListPage />} />
          <Route path="/posts/:id" element={<PostDetailPage />} />
        </Routes>
      </main>

      <style>{`
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
            'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
            sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          background-color: #f7f8fa;
          color: #2c3e50;
          font-size: 18px;
          line-height: 1.7;
        }

        .main-content {
          min-height: calc(100vh - 70px);
        }
      `}</style>
    </BrowserRouter>
  );
};

export default App;
