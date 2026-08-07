import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { BoxSelect } from 'lucide-react';

const PlaceholderPage: React.FC<{ title: string }> = ({ title }) => (
  <div className="py-6 h-[calc(100vh-120px)]">
    <Card className="h-full p-6 flex flex-col">
      <h1 className="text-2xl font-bold text-on-surface mb-6">{title}</h1>
      <div className="flex-1">
        <EmptyState 
          icon={BoxSelect}
          title="Module Not Implemented"
          description={`The ${title} module architecture is ready but business logic has not been added yet.`}
        />
      </div>
    </Card>
  </div>
);

export const Router: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<PlaceholderPage title="Home" />} />
          <Route path="dashboard" element={<PlaceholderPage title="Dashboard" />} />
          <Route path="search" element={<PlaceholderPage title="Search" />} />
          <Route path="profile" element={<PlaceholderPage title="Profile" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};
