import {
  Point2,
  Vector2,
  Vector3,
  Vector4,
  lookAt,
  multiply,
  orthographic,
  scale,
  translate,
} from '@pixel-craft/math';
import { uniformBufferAllocator } from '../buffer/uniform-buffer-allocator';

export type Camera = {
  projectionViewMatrixUniformBuffer: GPUBuffer;
  transformUniformBuffer: GPUBuffer;
  observe: (position: Point2) => void;
  zoom: (scaling: Point2) => void;
};

/**
 * Creates a projection view matrix uniform buffer with the given width and height.
 *
 * @remarks
 * This is a convenience function for creating an orthographic projection view matrix uniform buffer.
 * The projection view matrix is calculated using the given width and height.
 * The buffer is written to the GPU queue on creation.
 */
export function createCamera(
  device: GPUDevice,
  width: number,
  height: number,
): Camera {
  const projectionViewMatrixUniformBuffer = uniformBufferAllocator(device)(
    new Float32Array(16 * Float32Array.BYTES_PER_ELEMENT),
  );
  const transformUniformBuffer = uniformBufferAllocator(device)(
    new Float32Array(4 * Float32Array.BYTES_PER_ELEMENT),
  );

  const scaling = new Vector3({ x: 1, y: 1, z: 1 });
  const position = new Vector2({ x: 0, y: 0 });
  const projectionMatrix = orthographic(0, width, height, 0, -1, 1);
  const viewMatrix = lookAt(
    new Vector3({ x: 0, y: 0, z: 1 }),
    new Vector3({ x: 0, y: 0, z: 0 }),
    new Vector3({ x: 0, y: 1, z: 0 }),
  );
  const projectionViewMatrix = multiply(viewMatrix, projectionMatrix);

  const observe = ({ x, y }: Point2) => {
    position.x = x;
    position.y = y;
    update();
  };

  const zoom = ({ x, y }: Point2) => {
    scaling.x = x;
    scaling.y = y;
    update();
  };

  const update = () => {
    const translation = new Vector4({
      x: -position.x,
      y: -position.y,
      z: 0,
      w: 1,
    }).multiply(projectionMatrix);
    const translated = translate(projectionViewMatrix, translation);
    const scaled = scale(translated, scaling);

    device.queue.writeBuffer(
      projectionViewMatrixUniformBuffer,
      0,
      new Float32Array(scaled),
    );
    device.queue.writeBuffer(
      transformUniformBuffer,
      0,
      new Float32Array([-position.x, -position.y, scaling.x, scaling.y]),
    );
  };

  update();

  return {
    projectionViewMatrixUniformBuffer,
    transformUniformBuffer,
    observe,
    zoom,
  };
}
