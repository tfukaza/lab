export interface GroundDirection {
  x: number;
  z: number;
}

export function cameraRelativeGroundDirection(
  cameraX: number,
  cameraZ: number,
  targetX: number,
  targetZ: number,
  lateralInput: number,
  forwardInput: number,
): GroundDirection {
  const forwardX = targetX - cameraX;
  const forwardZ = targetZ - cameraZ;
  const forwardLength = Math.hypot(forwardX, forwardZ);
  if (forwardLength <= 0.0001) return { x: 0, z: 0 };

  const normalizedForwardX = forwardX / forwardLength;
  const normalizedForwardZ = forwardZ / forwardLength;
  // Up × forward is screen-right in Babylon's left-handed world.
  const rightX = normalizedForwardZ;
  const rightZ = -normalizedForwardX;
  const x = rightX * lateralInput + normalizedForwardX * forwardInput;
  const z = rightZ * lateralInput + normalizedForwardZ * forwardInput;
  const length = Math.hypot(x, z);
  return length > 0.0001 ? { x: x / length, z: z / length } : { x: 0, z: 0 };
}

export function encodeCrushDirection(x: number, z: number): [number, number] {
  const length = Math.hypot(x, z);
  if (length <= 0.0001) return [128, 128];
  const normalizedX = x / length;
  const normalizedZ = z / length;
  return [
    Math.round((normalizedX * 0.5 + 0.5) * 255),
    Math.round((normalizedZ * 0.5 + 0.5) * 255),
  ];
}
