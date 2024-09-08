import React, { useState } from 'react';
import { Mail, Calendar, CheckSquare } from 'lucide-react';
import { ExternalLink, Sun, Moon } from 'lucide-react';

const AppCard = ({ title, url, icon: Icon, gradient, lightGradient, isDark }) => (
  <div className={`relative overflow-hidden rounded-xl p-4 sm:p-6 ${isDark ? gradient : lightGradient} transform hover:scale-105 transition-all duration-300 shadow-lg group`}>
    <div className={`absolute inset-0 ${isDark ? 'bg-white opacity-10' : 'bg-black opacity-5'} group-hover:opacity-20 transition-opacity duration-300`}></div>
    <div className={`relative z-10 flex flex-col items-center ${isDark ? 'text-white' : 'text-gray-800'}`}>
      <Icon size={36} className="mb-3 transform group-hover:rotate-12 transition-transform duration-300" />
      <h3 className="text-lg sm:text-xl font-bold mb-2 text-center">{title}</h3>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-2 sm:mt-4 px-4 sm:px-6 py-2 ${isDark ? 'bg-white bg-opacity-20 text-white' : 'bg-gray-800 bg-opacity-10 text-gray-800'} rounded-full flex items-center space-x-2 hover:bg-opacity-30 transition-all duration-300`}
      >
        <span>Launch</span>
        <ExternalLink size={16} />
      </a>
    </div>
    <div className={`absolute bottom-0 right-0 w-16 h-16 sm:w-24 sm:h-24 ${isDark ? 'bg-white opacity-10' : 'bg-black opacity-5'} rounded-tl-full transform translate-x-8 translate-y-8 sm:translate-x-12 sm:translate-y-12`}></div>
  </div>
);

const ThemeToggle = ({ isDark, toggleTheme }) => (
  <button
    onClick={toggleTheme}
    className={`fixed top-4 right-4 p-2 rounded-full ${isDark ? 'bg-gray-800 text-yellow-400' : 'bg-white text-gray-800'} shadow-lg transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 z-10`}
    aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
  >
    {isDark ? <Sun size={24} /> : <Moon size={24} />}
  </button>
);

const App = () => {
  const [isDark, setIsDark] = useState(true);
  const toggleTheme = () => setIsDark(!isDark);

  return (
    <div className={`min-h-screen ${isDark ? 'bg-gradient-to-br from-gray-900 to-gray-800' : 'bg-gradient-to-br from-gray-100 to-white'} p-4 sm:p-8 flex flex-col items-center justify-center transition-colors duration-300`}>
      <ThemeToggle isDark={isDark} toggleTheme={toggleTheme} />
      <h1 className={`text-3xl sm:text-4xl font-extrabold mb-8 sm:mb-12 text-center ${isDark ? 'text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600' : 'text-gray-800'}`}>
         App Launcher
      </h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-8 w-full max-w-6xl">
        <AppCard 
          title="خارجي قوي عاملة" 
          url="https://mail.example.com" 
          icon={Mail} 
          gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
          lightGradient="bg-gradient-to-br from-blue-100 to-indigo-200"
          isDark={isDark}
        />
        <AppCard 
          title="خارجي طلاب" 
          url="https://calendar.example.com" 
          icon={Calendar} 
          gradient="bg-gradient-to-br from-green-500 to-teal-600"
          lightGradient="bg-gradient-to-br from-green-100 to-teal-200"
          isDark={isDark}
        />
        <AppCard 
          title="المجموعات الدوائية" 
          url="https://tasks.example.com" 
          icon={CheckSquare} 
          gradient="bg-gradient-to-br from-purple-500 to-pink-600"
          lightGradient="bg-gradient-to-br from-purple-100 to-pink-200"
          isDark={isDark}
        />
      </div>
    </div>
  );
};

export default App;
