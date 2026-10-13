interface RotatedBody {
  rotation: [number, number, number, number];
}

/** Yaw in radians from a body's world quaternion, or 0 with no body. */
export function playerYawFromRotation(body: RotatedBody | null): number {
  return body ? 2 * Math.atan2(body.rotation[1], body.rotation[3]) : 0;
}
