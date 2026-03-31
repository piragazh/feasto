import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

function SidebarNav({ sections, activeSection, activeTab, onNavigate, collapsed, restaurant }) {
    const [expanded, setExpanded] = useState(() => {
        const init = {};
        sections.forEach(s => { init[s.id] = s.id === activeSection; });
        return init;
    });

    const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

    return (
        <nav className="flex flex-col gap-0.5 px-2 py-3 overflow-y-auto flex-1">
            {sections.map(section => {
                const isActive = section.id === activeSection;
                const isOpen = expanded[section.id];
                const SIcon = section.icon;
                const totalBadge = section.items.reduce((s, i) => s + (i.badge || 0), 0);

                return (
                    <div key={section.id}>
                        <button
                            onClick={() => { toggle(section.id); if (section.items.length === 1) onNavigate(section.id, section.items[0].id); }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                                isActive ? 'bg-orange-500 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                            <SIcon className="h-4 w-4 flex-shrink-0" />
                            {!collapsed && (
                                <>
                                    <span className="flex-1 text-left truncate">{section.label}</span>
                                    {totalBadge > 0 && !isOpen && (
                                        <span className="h-4 w-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center flex-shrink-0">
                                            {totalBadge}
                                        </span>
                                    )}
                                    {section.items.length > 1 && (
                                        isOpen ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 opacity-70" /> : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
                                    )}
                                </>
                            )}
                        </button>

                        {!collapsed && isOpen && section.items.length > 1 && (
                            <div className="ml-3 mt-0.5 mb-1 border-l border-white/10 pl-3 flex flex-col gap-0.5">
                                {section.items.map(item => {
                                    const IIcon = item.icon;
                                    const isItemActive = activeSection === section.id && activeTab === item.id;
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => onNavigate(section.id, item.id)}
                                            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-all ${
                                                isItemActive ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/10 hover:text-slate-200'
                                            }`}
                                        >
                                            <IIcon className="h-3.5 w-3.5 flex-shrink-0" />
                                            <span className="flex-1 text-left truncate">{item.label}</span>
                                            {item.badge > 0 && (
                                                <span className="h-4 min-w-[16px] bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center px-1 flex-shrink-0">
                                                    {item.badge}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </nav>
    );
}

export default SidebarNav;