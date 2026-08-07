import { createContext, useContext, ReactNode } from 'react';

/**
 * A flat list of suggestions formatted as `{BlockName.FieldName}`.
 */
export type AutoSuggestions = string[];

export const AutoSuggestionContext = createContext<AutoSuggestions>([]);

export function useAutoSuggestions(): AutoSuggestions {
  return useContext(AutoSuggestionContext);
}

export function AutoSuggestionProvider({
  suggestions,
  children,
}: {
  suggestions: AutoSuggestions;
  children: ReactNode;
}) {
  return (
    <AutoSuggestionContext.Provider value={suggestions}>
      {children}
    </AutoSuggestionContext.Provider>
  );
}
