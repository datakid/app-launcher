import React from 'react';
import { ExternalLink } from 'lucide-react';

const AppCard = ({ title, url, color, icon }) => (
  <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    className={`block p-6 rounded-lg shadow-lg transform transition duration-300 hover:scale-105 ${color}`}
  >
    <div className="flex items-center justify-between">
      <h2 className="text-2xl font-bold text-white truncate">{title}</h2>
      <div className="flex-shrink-0 w-8 h-8">{icon}</div>
    </div>
    <div className="mt-4 flex items-center text-white">
      <ExternalLink size={20} />
      <span className="ml-2">Launch App</span>
    </div>
  </a>
);

const EpicAppLauncher = () => (
  <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-500 p-8">
    <div className="max-w-4xl mx-auto">
      <h1 className="text-4xl font-extrabold text-white text-center mb-12">
        Epic App Launcher
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <AppCard
          title="خارجي قوي عاملة"
          url="https://example.com/app1"
          color="bg-gradient-to-r from-pink-500 to-yellow-500"
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-8 h-8 text-white"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12zm-1-5a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1zm0-3a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1z"
                clipRule="evenodd"
              />
            </svg>
          }
        />
        <AppCard
          title="خارجي طلاب"
          url="https://example.com/app2"
          color="bg-gradient-to-r from-green-400 to-blue-500"
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-8 h-8 text-white"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838l-2.727 1.17 1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zm5.99 7.176A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z" />
            </svg>
          }
        />
        <AppCard
          title="المجموعات الدوائية"
          url="https://example.com/app3"
          color="bg-gradient-to-r from-purple-500 to-indigo-500"
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-8 h-8 text-white"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                clipRule="evenodd"
              />
            </svg>
          }
        />
      </div>
    </div>
  </div>
);

export default EpicAppLauncher;
