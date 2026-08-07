import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useAutoSuggestions } from '../../contexts/AutoSuggestionContext';

interface AutocompleteInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onValueChange: (val: string) => void;
}

export function AutocompleteInput({ onValueChange, value, ...props }: AutocompleteInputProps) {
  const suggestions = useAutoSuggestions();
  const [showDropdown, setShowDropdown] = useState(false);
  const [filter, setFilter] = useState('');
  const [cursorPos, setCursorPos] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onValueChange(val);
    
    // Check if user is typing a variable
    const pos = e.target.selectionStart;
    if (pos !== null) {
      const textBeforeCursor = val.slice(0, pos);
      const match = textBeforeCursor.match(/\{([^}]*)$/);
      if (match) {
        setFilter(match[1].toLowerCase());
        setCursorPos(pos);
        setShowDropdown(true);
        setActiveIndex(0);
      } else {
        setShowDropdown(false);
      }
    }
  };

  const filteredSuggestions = suggestions.filter((s) => s.toLowerCase().includes(filter));

  const insertSuggestion = (suggestion: string) => {
    if (cursorPos === null || typeof value !== 'string') return;
    
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);
    
    // find where the { started
    const match = textBeforeCursor.match(/\{([^}]*)$/);
    if (match) {
      const startIdx = textBeforeCursor.lastIndexOf('{');
      const newText = value.slice(0, startIdx) + suggestion + textAfterCursor;
      onValueChange(newText);
      
      // Move cursor after inserted text
      setTimeout(() => {
        if (inputRef.current) {
          const newPos = startIdx + suggestion.length;
          inputRef.current.setSelectionRange(newPos, newPos);
          inputRef.current.focus();
        }
      }, 0);
    }
    setShowDropdown(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || filteredSuggestions.length === 0) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i < filteredSuggestions.length - 1 ? i + 1 : i));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i > 0 ? i - 1 : 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertSuggestion(filteredSuggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <input
        {...props}
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {showDropdown && filteredSuggestions.length > 0 && (
        <ul className="viz-autocomplete-dropdown">
          {filteredSuggestions.map((s, idx) => (
            <li
              key={s}
              className={idx === activeIndex ? 'is-active' : ''}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus on input
                insertSuggestion(s);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
