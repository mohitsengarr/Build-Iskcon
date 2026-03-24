declare module "react-simple-maps" {
  import { ComponentProps, ReactNode } from "react";

  interface GeographyObject {
    rsmKey: string;
    [key: string]: unknown;
  }

  interface GeographiesChildrenArg {
    geographies: GeographyObject[];
  }

  interface MoveEndArg {
    coordinates: [number, number];
    zoom: number;
  }

  export function ComposableMap(props: {
    projection?: string;
    projectionConfig?: Record<string, unknown>;
    style?: React.CSSProperties;
    height?: number;
    children?: ReactNode;
    [key: string]: unknown;
  }): JSX.Element;

  export function ZoomableGroup(props: {
    zoom?: number;
    center?: [number, number];
    onMoveEnd?: (arg: MoveEndArg) => void;
    children?: ReactNode;
    [key: string]: unknown;
  }): JSX.Element;

  export function Geographies(props: {
    geography: string;
    children: (arg: GeographiesChildrenArg) => ReactNode;
    [key: string]: unknown;
  }): JSX.Element;

  export function Geography(props: {
    geography: GeographyObject;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    style?: {
      default?: React.CSSProperties;
      hover?: React.CSSProperties;
      pressed?: React.CSSProperties;
    };
    [key: string]: unknown;
  }): JSX.Element;

  export function Marker(props: {
    coordinates: [number, number];
    children?: ReactNode;
    [key: string]: unknown;
  }): JSX.Element;
}
