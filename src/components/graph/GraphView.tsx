import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { GraphData, GraphNode, GraphLink } from '../../types';
import { Network, ZoomIn, ZoomOut, RotateCcw, FileText, Hash, Eye, EyeOff } from 'lucide-react';

interface GraphViewProps {
  username: string;
  onSelectNote: (noteTitle: string) => void;
}

export const GraphView: React.FC<GraphViewProps> = ({ username, onSelectNote }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  // Toggle to show / hide #-Tags in the knowledge graph
  const [showTags, setShowTags] = useState<boolean>(true);

  // Viewport transforms
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const draggedNodeRef = useRef<GraphNode | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const animFrameRef = useRef<number | null>(null);

  // Load graph data
  const loadGraph = async () => {
    setLoading(true);
    try {
      const graph = await api.fetchGraph(username);
      const width = canvasRef.current?.width || 800;
      const height = canvasRef.current?.height || 600;

      const nodes = graph.nodes.map((n, i) => {
        const angle = (i / Math.max(1, graph.nodes.length)) * 2 * Math.PI;
        const radius = 100 + Math.random() * 150;
        return {
          ...n,
          x: width / 2 + Math.cos(angle) * radius,
          y: height / 2 + Math.sin(angle) * radius,
          vx: 0,
          vy: 0,
        };
      });

      nodesRef.current = nodes;
      linksRef.current = graph.links;
      setData(graph);
    } catch (e) {
      console.error('Failed to load graph', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGraph();
  }, [username]);

  // Simulation & Rendering loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isRunning = true;

    const tick = () => {
      const width = canvas.width;
      const height = canvas.height;
      const allNodes = nodesRef.current;
      const allLinks = linksRef.current;

      // Filter visible nodes based on showTags
      const visibleNodes = showTags ? allNodes : allNodes.filter((n) => n.type !== 'tag');
      const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
      const visibleLinks = allLinks.filter((l) => visibleNodeIds.has(l.source) && visibleNodeIds.has(l.target));

      // 1. Repulsion between nodes
      for (let i = 0; i < visibleNodes.length; i++) {
        for (let j = i + 1; j < visibleNodes.length; j++) {
          const a = visibleNodes[i];
          const b = visibleNodes[j];
          const dx = (b.x || 0) - (a.x || 0);
          const dy = (b.y || 0) - (a.y || 0);
          const distSq = dx * dx + dy * dy || 1;
          const dist = Math.sqrt(distSq);

          if (dist < 250) {
            const force = 1800 / distSq;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            if (draggedNodeRef.current !== a) {
              a.vx = (a.vx || 0) - fx;
              a.vy = (a.vy || 0) - fy;
            }
            if (draggedNodeRef.current !== b) {
              b.vx = (b.vx || 0) + fx;
              b.vy = (b.vy || 0) + fy;
            }
          }
        }
      }

      // 2. Link springs
      for (const link of visibleLinks) {
        const sourceNode = visibleNodes.find((n) => n.id === link.source);
        const targetNode = visibleNodes.find((n) => n.id === link.target);

        if (sourceNode && targetNode) {
          const dx = (targetNode.x || 0) - (sourceNode.x || 0);
          const dy = (targetNode.y || 0) - (sourceNode.y || 0);
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const desiredDist = 120;
          const force = (dist - desiredDist) * 0.03;

          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (draggedNodeRef.current !== sourceNode) {
            sourceNode.vx = (sourceNode.vx || 0) + fx;
            sourceNode.vy = (sourceNode.vy || 0) + fy;
          }
          if (draggedNodeRef.current !== targetNode) {
            targetNode.vx = (targetNode.vx || 0) - fx;
            targetNode.vy = (targetNode.vy || 0) - fy;
          }
        }
      }

      // 3. Centering force & velocity damping
      const cx = width / 2;
      const cy = height / 2;

      for (const node of visibleNodes) {
        if (draggedNodeRef.current === node) continue;

        const dx = cx - (node.x || cx);
        const dy = cy - (node.y || cy);
        node.vx = ((node.vx || 0) + dx * 0.005) * 0.85;
        node.vy = ((node.vy || 0) + dy * 0.005) * 0.85;

        node.x = (node.x || 0) + (node.vx || 0);
        node.y = (node.y || 0) + (node.vy || 0);
      }

      // Render
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(transformRef.current.x, transformRef.current.y);
      ctx.scale(transformRef.current.scale, transformRef.current.scale);

      // Draw links
      const isDark = document.documentElement.classList.contains('dark');
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)';
      ctx.lineWidth = 1;

      for (const link of visibleLinks) {
        const sourceNode = visibleNodes.find((n) => n.id === link.source);
        const targetNode = visibleNodes.find((n) => n.id === link.target);
        if (sourceNode && targetNode) {
          ctx.beginPath();
          ctx.moveTo(sourceNode.x || 0, sourceNode.y || 0);
          ctx.lineTo(targetNode.x || 0, targetNode.y || 0);
          ctx.stroke();
        }
      }

      // Draw nodes
      for (const node of visibleNodes) {
        const isHovered = hoveredNode?.id === node.id;
        const radius = node.type === 'tag' ? 5 : isHovered ? 9 : 7;

        ctx.beginPath();
        ctx.arc(node.x || 0, node.y || 0, radius, 0, 2 * Math.PI);

        if (node.type === 'tag') {
          ctx.fillStyle = isDark ? '#E5E7EB' : '#6B7280';
        } else {
          ctx.fillStyle = '#C87D20';
        }
        ctx.fill();

        if (isHovered) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Label
        ctx.font = '11px sans-serif';
        ctx.fillStyle = isDark ? '#D1D5DB' : '#374151';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x || 0, (node.y || 0) + radius + 12);
      }

      ctx.restore();

      if (isRunning) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      isRunning = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [hoveredNode, showTags]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = canvasRef.current.clientWidth;
        canvasRef.current.height = canvasRef.current.clientHeight;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getCanvasCoords = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    return {
      x: (clientX - transformRef.current.x) / transformRef.current.scale,
      y: (clientY - transformRef.current.y) / transformRef.current.scale,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const coords = getCanvasCoords(e);
    const visibleNodes = showTags ? nodesRef.current : nodesRef.current.filter((n) => n.type !== 'tag');

    const clicked = visibleNodes.find((n) => {
      const dx = (n.x || 0) - coords.x;
      const dy = (n.y || 0) - coords.y;
      return Math.sqrt(dx * dx + dy * dy) < 14;
    });

    if (clicked) {
      draggedNodeRef.current = clicked;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    } else {
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const coords = getCanvasCoords(e);

    if (draggedNodeRef.current) {
      draggedNodeRef.current.x = coords.x;
      draggedNodeRef.current.y = coords.y;
      draggedNodeRef.current.vx = 0;
      draggedNodeRef.current.vy = 0;
    } else if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      transformRef.current.x += dx;
      transformRef.current.y += dy;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    } else {
      const visibleNodes = showTags ? nodesRef.current : nodesRef.current.filter((n) => n.type !== 'tag');
      const hovered = visibleNodes.find((n) => {
        const dx = (n.x || 0) - coords.x;
        const dy = (n.y || 0) - coords.y;
        return Math.sqrt(dx * dx + dy * dy) < 14;
      });
      setHoveredNode(hovered || null);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (draggedNodeRef.current) {
      const node = draggedNodeRef.current;
      draggedNodeRef.current = null;
      // Only navigate if it was a stationary click (movement <= 6px), not an intentional bubble drag
      const movedDist = Math.hypot(e.clientX - dragStartRef.current.x, e.clientY - dragStartRef.current.y);
      if (movedDist <= 6 && node.type === 'note') {
        onSelectNote(node.id);
      }
    }
    isDraggingRef.current = false;
  };

  // Zoom anchored directly to the mouse cursor position
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const currentScale = transformRef.current.scale;
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newScale = Math.max(0.2, Math.min(4, currentScale * zoomFactor));

    // Anchor world coordinates under mouse
    const worldX = (mouseX - transformRef.current.x) / currentScale;
    const worldY = (mouseY - transformRef.current.y) / currentScale;

    transformRef.current.x = mouseX - worldX * newScale;
    transformRef.current.y = mouseY - worldY * newScale;
    transformRef.current.scale = newScale;
  };

  const resetZoom = () => {
    transformRef.current = { x: 0, y: 0, scale: 1 };
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-[#FBFBFA] dark:bg-[#18191B] relative select-none">
      {/* Top Graph Controls Bar */}
      <div className="h-10 px-4 border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between z-10 bg-[#FBFBFA]/80 dark:bg-[#18191B]/80 backdrop-blur-xs">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-[#C87D20]" />
          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            Wissensgraph
          </span>
          <span className="text-[11px] text-neutral-400 hidden sm:inline">
            ({data.nodes.length} Knoten, {data.links.length} Verbindungen)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Toggle #-Tags Ausblenden / Einblenden */}
          <button
            onClick={() => setShowTags(!showTags)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${
              showTags
                ? 'bg-amber-50 dark:bg-amber-950/30 text-[#C87D20] border-[#C87D20]/40 font-medium'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border-[#E5E3DC] dark:border-neutral-700'
            }`}
            title={showTags ? '#-Tags im Graph ausblenden' : '#-Tags im Graph einblenden'}
          >
            <Hash className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{showTags ? 'Tags sichtbar' : 'Tags ausgeblendet'}</span>
          </button>

          <div className="w-px h-4 bg-[#E5E3DC] dark:bg-[#2F3136] mx-0.5" />

          {/* Zoom Buttons */}
          <button
            onClick={() => {
              transformRef.current.scale = Math.min(4, transformRef.current.scale * 1.2);
            }}
            className="p-1 rounded text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800"
            title="Vergrößern"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              transformRef.current.scale = Math.max(0.2, transformRef.current.scale * 0.8);
            }}
            className="p-1 rounded text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800"
            title="Verkleinern"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={resetZoom}
            className="p-1 rounded text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800"
            title="Ansicht zentrieren"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas Viewport */}
      <div className="flex-1 relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-neutral-400">
            Graph wird berechnet...
          </div>
        )}
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          className="w-full h-full cursor-grab active:cursor-grabbing block"
        />

        {/* Floating Node Info Tooltip */}
        {hoveredNode && (
          <div className="absolute bottom-4 left-4 p-2.5 rounded-lg bg-neutral-900/90 text-white text-xs shadow-lg backdrop-blur-xs flex items-center gap-2 pointer-events-none">
            {hoveredNode.type === 'note' ? (
              <FileText className="w-3.5 h-3.5 text-[#C87D20]" />
            ) : (
              <Hash className="w-3.5 h-3.5 text-neutral-300" />
            )}
            <div>
              <span className="font-semibold block">{hoveredNode.label}</span>
              <span className="text-[10px] text-neutral-400">
                {hoveredNode.type === 'note' ? 'Klicken zum Öffnen der Notiz' : 'Themen-Tag'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
