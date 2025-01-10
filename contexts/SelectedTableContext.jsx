// contexts/SelectedTableContext.js
'use client'
import React, { createContext, useState } from 'react';

export const SelectedTableContext = createContext();

export const SelectedTableProvider = ({ children }) => {
  const [selectedTable, setSelectedTable] = useState('usa');

  return (
    <SelectedTableContext.Provider value={{ selectedTable, setSelectedTable }}>
      {children}
    </SelectedTableContext.Provider>
  );
};
