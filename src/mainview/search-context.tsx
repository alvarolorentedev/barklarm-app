import React, { createContext, useContext, useState } from 'react';

type SearchContextValue = {
  search: string;
  setSearch: (value: string) => void;
};

const defaultValue: SearchContextValue = {
  search: '',
  setSearch: () => undefined,
};

const SearchContext = createContext<SearchContextValue>(defaultValue);

export const SearchProvider = ({ children }: { children: React.ReactNode }) => {
  const [search, setSearch] = useState('');
  return <SearchContext.Provider value={{ search, setSearch }}>{children}</SearchContext.Provider>;
};

export const useSearch = () => useContext(SearchContext);
