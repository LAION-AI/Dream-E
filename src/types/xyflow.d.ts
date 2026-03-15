/**
 * =============================================================================
 * TYPE DECLARATIONS FOR @xyflow/react
 * =============================================================================
 *
 * These declarations provide TypeScript types for the React Flow library.
 * React Flow is used for the node editor canvas.
 *
 * =============================================================================
 */

declare module '@xyflow/react' {
  import { ComponentType, ReactNode, CSSProperties } from 'react';

  // ==================== CORE TYPES ====================

  export interface XYPosition {
    x: number;
    y: number;
  }

  export interface Dimensions {
    width: number;
    height: number;
  }

  export interface Node<T = any> {
    id: string;
    type?: string;
    position: XYPosition;
    data: T;
    style?: CSSProperties;
    className?: string;
    selected?: boolean;
    draggable?: boolean;
    selectable?: boolean;
    connectable?: boolean;
    deletable?: boolean;
    hidden?: boolean;
    width?: number;
    height?: number;
    parentId?: string;
    zIndex?: number;
    extent?: 'parent' | [[number, number], [number, number]];
    expandParent?: boolean;
    sourcePosition?: Position;
    targetPosition?: Position;
    dragHandle?: string;
  }

  export interface Edge<T = any> {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    type?: string;
    data?: T;
    style?: CSSProperties;
    className?: string;
    animated?: boolean;
    hidden?: boolean;
    deletable?: boolean;
    selectable?: boolean;
    label?: string | ReactNode;
    labelStyle?: CSSProperties;
    labelShowBg?: boolean;
    labelBgStyle?: CSSProperties;
    labelBgPadding?: [number, number];
    labelBgBorderRadius?: number;
    markerStart?: string | EdgeMarker;
    markerEnd?: string | EdgeMarker;
    zIndex?: number;
    interactionWidth?: number;
  }

  export interface EdgeMarker {
    type: MarkerType;
    color?: string;
    width?: number;
    height?: number;
    markerUnits?: string;
    orient?: string;
    strokeWidth?: number;
  }

  export enum MarkerType {
    Arrow = 'arrow',
    ArrowClosed = 'arrowclosed',
  }

  export enum Position {
    Left = 'left',
    Top = 'top',
    Right = 'right',
    Bottom = 'bottom',
  }

  export interface Connection {
    source: string | null;
    target: string | null;
    sourceHandle: string | null;
    targetHandle: string | null;
  }

  export type NodeTypes = Record<string, ComponentType<any>>;
  export type EdgeTypes = Record<string, ComponentType<any>>;

  export interface NodeProps<T = any> {
    id: string;
    data: T;
    type?: string;
    xPos: number;
    yPos: number;
    selected?: boolean;
    isConnectable?: boolean;
    sourcePosition?: Position;
    targetPosition?: Position;
    dragging?: boolean;
    zIndex?: number;
  }

  // ==================== HOOKS ====================

  export function useNodesState<T = any>(
    initialNodes: Node<T>[]
  ): [Node<T>[], (nodes: Node<T>[] | ((nodes: Node<T>[]) => Node<T>[])) => void, (changes: any) => void];

  export function useEdgesState<T = any>(
    initialEdges: Edge<T>[]
  ): [Edge<T>[], (edges: Edge<T>[] | ((edges: Edge<T>[]) => Edge<T>[])) => void, (changes: any) => void];

  export function useReactFlow(): {
    getNodes: () => Node[];
    getEdges: () => Edge[];
    setNodes: (nodes: Node[] | ((nodes: Node[]) => Node[])) => void;
    setEdges: (edges: Edge[] | ((edges: Edge[]) => Edge[])) => void;
    addNodes: (nodes: Node | Node[]) => void;
    addEdges: (edges: Edge | Edge[]) => void;
    fitView: (options?: any) => void;
    zoomIn: () => void;
    zoomOut: () => void;
    getViewport: () => { x: number; y: number; zoom: number };
    setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
    setCenter: (x: number, y: number, options?: { zoom?: number; duration?: number }) => void;
  };

  export function useNodes<T = any>(): Node<T>[];
  export function useEdges<T = any>(): Edge<T>[];

  // ==================== COMPONENTS ====================

  export interface ReactFlowProps {
    nodes?: Node[];
    edges?: Edge[];
    defaultNodes?: Node[];
    defaultEdges?: Edge[];
    onNodesChange?: (changes: any) => void;
    onEdgesChange?: (changes: any) => void;
    onConnect?: (connection: Connection) => void;
    onNodeClick?: (event: React.MouseEvent, node: Node) => void;
    onNodeDoubleClick?: (event: React.MouseEvent, node: Node) => void;
    onNodeDragStart?: (event: React.MouseEvent, node: Node) => void;
    onNodeDrag?: (event: React.MouseEvent, node: Node) => void;
    onNodeDragStop?: (event: React.MouseEvent, node: Node) => void;
    onEdgeClick?: (event: React.MouseEvent, edge: Edge) => void;
    onEdgeDoubleClick?: (event: React.MouseEvent, edge: Edge) => void;
    onPaneClick?: (event: React.MouseEvent) => void;
    onDrop?: (event: React.DragEvent) => void;
    onDragOver?: (event: React.DragEvent) => void;
    nodeTypes?: NodeTypes;
    edgeTypes?: EdgeTypes;
    defaultEdgeOptions?: Partial<Edge>;
    snapToGrid?: boolean;
    snapGrid?: [number, number];
    fitView?: boolean;
    fitViewOptions?: any;
    minZoom?: number;
    maxZoom?: number;
    defaultViewport?: { x: number; y: number; zoom: number };
    proOptions?: { hideAttribution?: boolean };
    className?: string;
    style?: CSSProperties;
    children?: ReactNode;
  }

  export const ReactFlow: ComponentType<ReactFlowProps>;

  export interface HandleProps {
    type: 'source' | 'target';
    position: Position;
    id?: string;
    isConnectable?: boolean;
    style?: CSSProperties;
    className?: string;
  }

  export const Handle: ComponentType<HandleProps>;

  export interface BackgroundProps {
    variant?: BackgroundVariant;
    gap?: number;
    size?: number;
    color?: string;
    className?: string;
    style?: CSSProperties;
  }

  export enum BackgroundVariant {
    Lines = 'lines',
    Dots = 'dots',
    Cross = 'cross',
  }

  export const Background: ComponentType<BackgroundProps>;

  export interface ControlsProps {
    showZoom?: boolean;
    showFitView?: boolean;
    showInteractive?: boolean;
    className?: string;
    style?: CSSProperties;
  }

  export const Controls: ComponentType<ControlsProps>;

  export interface MiniMapProps {
    nodeColor?: string | ((node: Node) => string);
    nodeStrokeColor?: string | ((node: Node) => string);
    nodeClassName?: string | ((node: Node) => string);
    nodeBorderRadius?: number;
    nodeStrokeWidth?: number;
    maskColor?: string;
    className?: string;
    style?: CSSProperties;
  }

  export const MiniMap: ComponentType<MiniMapProps>;

  export interface PanelProps {
    position: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
    className?: string;
    style?: CSSProperties;
    children?: ReactNode;
  }

  export const Panel: ComponentType<PanelProps>;

  export const ReactFlowProvider: ComponentType<{ children: ReactNode }>;

  // ==================== UTILITIES ====================

  export function addEdge(edgeParams: Edge | Connection, edges: Edge[]): Edge[];
}
