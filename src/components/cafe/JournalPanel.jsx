import { useEffect, useRef, useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const JOURNAL_ART = '/assets/journal-open.png';

export default function JournalPanel({ journal, dispatch, onClose }) {
  const panelRef = useRef(null);
  const [todoText, setTodoText] = useState('');
  const todos = Array.isArray(journal?.todos) ? journal.todos : [];

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const addTodo = (event) => {
    event.preventDefault();
    const text = todoText.trim();
    if (!text) return;

    dispatch({ type: 'ADD_TODO', payload: text });
    setTodoText('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="relative aspect-[558/447] w-[min(96vw,980px)] max-w-[110vh] max-h-[88vh] text-[#5c3825] drop-shadow-[0_26px_34px_rgba(0,0,0,0.45)]"
      >
        {/* Journal art as a purely visual layer — pointer-events disabled so it never blocks inputs */}
        <div
          className="absolute inset-0 bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${JOURNAL_ART})`, pointerEvents: 'none' }}
          aria-hidden="true"
        />

        {/* All interactive content sits above the art */}
        <div role="dialog" aria-modal="true" aria-label="Journal" className="relative z-20 h-full w-full">

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="absolute right-[6.8%] top-[6.4%] z-10 h-7 w-7 rounded-full bg-[#f3caa0]/70 text-[#744225] shadow-sm hover:bg-[#f7d8b6]"
            title="Close journal"
          >
            <X className="h-3.5 w-3.5" />
          </Button>

          {/* Left Header */}
          <input
          type="text"
          value={journal?.noteHeader ?? ''}
          onChange={(event) =>
            dispatch({
              type: 'SET_JOURNAL_NOTE_HEADER',
              payload: event.target.value
            })
          }
          className="absolute z-20 border-0 border-b border-[#8f5331]/25 bg-transparent px-1 pb-1 font-body text-[13px] font-semibold text-[#5c3825] outline-none placeholder:text-[#9b765a]/70 sm:text-sm"
          style={{ left: '19%', top: '14.2%', width: '25%' }}
          placeholder="Title..."
        />

          {/* Left Body */}
          <textarea
            value={journal?.note ?? ''}
            onChange={(event) => dispatch({ type: 'SET_JOURNAL_NOTE', payload: event.target.value })}
            className="absolute z-20 resize-none border-0 bg-transparent p-1 font-body text-[13px] leading-[1.7] text-[#5c3825] outline-none placeholder:text-[#9b765a]/70 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:text-sm"
            style={{ left: '15%', top: '18%', width: '30%', height: '59.7%' }}
            placeholder="Write your cafe notes..."
            spellCheck
          />

          {/* Right section */}
          <section className="absolute left-[56.3%] top-[14%] flex h-[63.5%] w-[33%] flex-col">
            {/* Right Header */}
            <input
              type="text"
              value={journal?.todoHeader ?? ''}
              onChange={(event) => dispatch({ type: 'SET_TODO_HEADER', payload: event.target.value })}
              className="z-20 w-[90%] shrink-0 border-0 border-b border-[#8f5331]/25 bg-transparent px-1 pb-1 font-body text-[13px] font-semibold text-[#5c3825] outline-none placeholder:text-[#9b765a]/70 sm:text-sm"
              placeholder="Title..."
            />
            {/* Right Body */}
            <form onSubmit={addTodo} className="mb-2 mt-2 flex items-center gap-1.5">
              <input
                value={todoText}
                onChange={(event) => setTodoText(event.target.value)}
                className="min-w-0 flex-1 border-0 bg-transparent px-1 py-0.5 font-body text-[13px] text-[#5c3825] outline-none placeholder:text-[#9b765a]/70 sm:text-sm"
                placeholder="Add a task..."
              />
              <Button
                type="submit"
                size="icon-sm"
                className="h-6 w-6 rounded-full bg-[#8f5331]/90 text-[#fff0d7] hover:bg-[#744225]"
                title="Add task"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </form>

            <div className="flex-1 space-y-1.5 overflow-y-auto pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {todos.map((todo) => (
                <div
                  key={todo.id}
                  className="group flex items-start gap-1.5 px-1 py-1"
                >
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'TOGGLE_TODO', payload: todo.id })}
                    className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-[#8f5331]/60 transition-colors ${
                      todo.completed ? 'bg-[#8f5331] text-[#fff0d7]' : 'bg-transparent text-transparent'
                    }`}
                    title={todo.completed ? 'Mark incomplete' : 'Mark complete'}
                  >
                    <Check className="h-2.5 w-2.5" />
                  </button>

                  <span
                    className={`min-w-0 flex-1 break-words font-body text-[13px] leading-[1.45] sm:text-sm ${
                      todo.completed ? 'text-[#8a6a4e] line-through decoration-[#8f5331]/80' : 'text-[#5c3825]'
                    }`}
                  >
                    {todo.text}
                  </span>

                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'REMOVE_TODO', payload: todo.id })}
                    className="rounded-sm p-0.5 text-[#8f5331]/55 opacity-0 transition hover:bg-[#8f5331]/10 hover:text-[#744225] group-hover:opacity-100 focus-visible:opacity-100"
                    title="Remove task"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
