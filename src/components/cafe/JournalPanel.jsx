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
        className="relative w-[min(96vw,980px)] max-h-[88vh] aspect-[558/447] bg-contain bg-center bg-no-repeat text-[#5c3825] drop-shadow-[0_26px_34px_rgba(0,0,0,0.45)]"
        style={{ backgroundImage: `url(${JOURNAL_ART})` }}
        role="dialog"
        aria-modal="true"
        aria-label="Journal"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="absolute right-[4.5%] top-[5%] z-10 h-8 w-8 rounded-full bg-[#f3caa0]/80 text-[#744225] shadow-sm hover:bg-[#f7d8b6]"
          title="Close journal"
        >
          <X className="h-4 w-4" />
        </Button>

        <section className="absolute left-[10%] top-[12%] h-[74%] w-[35%]">
          <textarea
            value={journal?.note ?? ''}
            onChange={(event) => dispatch({ type: 'SET_JOURNAL_NOTE', payload: event.target.value })}
            className="h-full w-full resize-none border-0 bg-transparent p-2 font-body text-sm leading-6 text-[#5c3825] outline-none placeholder:text-[#9b765a]/75"
            placeholder="Write your cafe notes..."
            spellCheck
          />
        </section>

        <section className="absolute left-[54%] top-[12%] flex h-[74%] w-[35%] flex-col">
          <form onSubmit={addTodo} className="mb-3 flex items-center gap-2">
            <input
              value={todoText}
              onChange={(event) => setTodoText(event.target.value)}
              className="min-w-0 flex-1 border-0 border-b border-[#b8865d]/50 bg-transparent px-1 py-1 font-body text-sm text-[#5c3825] outline-none placeholder:text-[#9b765a]/75"
              placeholder="Add a task..."
            />
            <Button
              type="submit"
              size="icon-sm"
              className="h-7 w-7 rounded-full bg-[#8f5331] text-[#fff0d7] hover:bg-[#744225]"
              title="Add task"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </form>

          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {todos.map((todo) => (
              <div
                key={todo.id}
                className="group flex items-start gap-2 rounded-md bg-[#fff0d7]/20 px-2 py-1.5"
              >
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'TOGGLE_TODO', payload: todo.id })}
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-[#8f5331]/70 transition-colors ${
                    todo.completed ? 'bg-[#8f5331] text-[#fff0d7]' : 'bg-transparent text-transparent'
                  }`}
                  title={todo.completed ? 'Mark incomplete' : 'Mark complete'}
                >
                  <Check className="h-3 w-3" />
                </button>

                <span
                  className={`min-w-0 flex-1 break-words font-body text-sm leading-5 ${
                    todo.completed ? 'text-[#8a6a4e] line-through decoration-[#8f5331]/80' : 'text-[#5c3825]'
                  }`}
                >
                  {todo.text}
                </span>

                <button
                  type="button"
                  onClick={() => dispatch({ type: 'REMOVE_TODO', payload: todo.id })}
                  className="rounded-sm p-0.5 text-[#8f5331]/60 opacity-70 transition hover:bg-[#8f5331]/10 hover:text-[#744225] group-hover:opacity-100"
                  title="Remove task"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
