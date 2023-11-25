import shader from './shader.wgsl';
import {indexBufferAllocator} from "../../buffer/index-buffer-allocator";
import {Sprite} from "../../../sprite";
import {vertexBufferAllocator} from "../../buffer/vertex-buffer-allocator";

type Batch = {
    instances: number;
    vertices: Float32Array;
    texture: GPUTexture;
};

const MAX_SPRITES_PER_BATCH = 10000;
const INIDICES_PER_SPRITE = 6; // one quad per sprite. A quad has 2 triangles, each with 3 vertices;
const FLOATS_PER_VERTEX = 7; // x, y, u, v, r, g, b
const FLOATS_PER_SPRITE = 4 * FLOATS_PER_VERTEX; // a quad has 4 unique vertices

export function pipeline(device: GPUDevice, context: GPUCanvasContext, projectionViewMatrixUniformBuffer: GPUBuffer) {
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    context.configure({
        device,
        format: presentationFormat,
        alphaMode: 'premultiplied',
    });

    const vertexBufferLayout: GPUVertexBufferLayout = {
        arrayStride: 7 * Float32Array.BYTES_PER_ELEMENT, // x: f32, y: f32, u: f32, v: f32, r: f32, g: f32, b: f32
        attributes: [
            {
                shaderLocation: 0,
                offset: 0,
                format: 'float32x2',
            },
            {
                shaderLocation: 1,
                offset: 2 * Float32Array.BYTES_PER_ELEMENT,
                format: 'float32x2',
            },
            {
                shaderLocation: 2,
                offset: 4 * Float32Array.BYTES_PER_ELEMENT,
                format: 'float32x3',
            },
        ],
        stepMode: 'vertex',
    };

    const projectionViewMatrixLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: {
                    type: 'uniform',
                },
            },
        ],
    });

    const textureBindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {},
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {},
            },
        ],
    });

    const sampler = device.createSampler({
        magFilter: 'nearest',
        minFilter: 'nearest',
    });

    const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [projectionViewMatrixLayout, textureBindGroupLayout],
    });

    const pipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: {
            module: device.createShaderModule({
                code: shader,
            }),
            entryPoint: 'vs_main',
            buffers: [vertexBufferLayout],
        },
        fragment: {
            module: device.createShaderModule({
                code: shader,
            }),
            entryPoint: 'fs_main',
            targets: [
                {
                    format: presentationFormat,
                    blend: {
                        color: {
                            srcFactor: 'one',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add',
                        },
                        alpha: {
                            srcFactor: 'one',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add',
                        },
                    },
                },
            ],
        },
        primitive: {
            topology: 'triangle-list',
        },
    });

    const indices = new Uint16Array(MAX_SPRITES_PER_BATCH * INIDICES_PER_SPRITE);
    for (let i = 0; i < MAX_SPRITES_PER_BATCH; i++) {
        // first triangle: 0, 1, 2
        indices[i * INIDICES_PER_SPRITE + 0] = i * 4 + 0;
        indices[i * INIDICES_PER_SPRITE + 1] = i * 4 + 1;
        indices[i * INIDICES_PER_SPRITE + 2] = i * 4 + 2;

        // second triangle: 2, 3, 0
        indices[i * INIDICES_PER_SPRITE + 3] = i * 4 + 2;
        indices[i * INIDICES_PER_SPRITE + 4] = i * 4 + 3;
        indices[i * INIDICES_PER_SPRITE + 5] = i * 4 + 0;
    }

    const vertexBufferAlloc = vertexBufferAllocator(device);
    const indexBuffer = indexBufferAllocator(device)(indices);

    const projectionViewMatrixBindGroup = device.createBindGroup({
        layout: projectionViewMatrixLayout,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: projectionViewMatrixUniformBuffer,
                },
            },
        ],
    });

    const vertexBuffers = [
        vertexBufferAlloc(new Float32Array(MAX_SPRITES_PER_BATCH * FLOATS_PER_SPRITE)),
    ];

    const textureBindGroups = new Map<GPUTexture, GPUBindGroup>();

    return (sprites: Sprite[]) => {
        const batchMap = new Map<GPUTexture, Batch[]>();

        for (const sprite of sprites) {
            const texture = sprite.texture;

            let textureBindGroup = textureBindGroups.get(texture);
            if (!textureBindGroup) {
                textureBindGroup = textureBindGroup = device.createBindGroup({
                    layout: textureBindGroupLayout,
                    entries: [
                        {
                            binding: 0,
                            resource: sampler,
                        },
                        {
                            binding: 1,
                            resource: texture.createView(),
                        },
                    ],
                });
                textureBindGroups.set(texture, textureBindGroup);
            }

            let batches = batchMap.get(texture);
            if (!batches) {
                batches = [];
                batchMap.set(texture, batches);
            }

            let batch = batches.at(-1);
            if (!batch || batch.instances === MAX_SPRITES_PER_BATCH) {
                batch = {
                    instances: 0,
                    vertices: new Float32Array(MAX_SPRITES_PER_BATCH * FLOATS_PER_SPRITE),
                    texture: sprite.texture,
                };
                batches.push(batch);
            }

            const i = batch.instances * FLOATS_PER_SPRITE;
            // top left
            batch.vertices[0 + i] = sprite.x;
            batch.vertices[1 + i] = sprite.y;
            batch.vertices[2 + i] = 0.0;
            batch.vertices[3 + i] = 0.0;
            batch.vertices[4 + i] = 1.0;
            batch.vertices[5 + i] = 1.0;
            batch.vertices[6 + i] = 1.0;

            // top right
            batch.vertices[7 + i] = sprite.x + sprite.width;
            batch.vertices[8 + i] = sprite.y;
            batch.vertices[9 + i] = 1.0;
            batch.vertices[10 + i] = 0.0;
            batch.vertices[11 + i] = 1.0;
            batch.vertices[12 + i] = 1.0;
            batch.vertices[13 + i] = 1.0;

            // bottom right
            batch.vertices[14 + i] = sprite.x + sprite.width;
            batch.vertices[15 + i] = sprite.y + sprite.height;
            batch.vertices[16 + i] = 1.0;
            batch.vertices[17 + i] = 1.0;
            batch.vertices[18 + i] = 1.0;
            batch.vertices[19 + i] = 1.0;
            batch.vertices[20 + i] = 1.0;

            // bottom left
            batch.vertices[21 + i] = sprite.x;
            batch.vertices[22 + i] = sprite.y + sprite.height;
            batch.vertices[23 + i] = 0.0;
            batch.vertices[24 + i] = 1.0;
            batch.vertices[25 + i] = 1.0;
            batch.vertices[26 + i] = 1.0;
            batch.vertices[27 + i] = 1.0;

            batch.instances++;
        }

        const textureView = context.getCurrentTexture().createView();

        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [
                {
                    view: textureView,
                    clearValue: { r: 0.8, g: 0.8, b: 0.8, a: 1.0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
        };

        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

        const usedVertexBuffers: GPUBuffer[] = [];

        for (const batches of batchMap.values()) {
            for (const batch of batches) {
                let vertexBuffer = vertexBuffers.pop();
                if (!vertexBuffer) {
                    vertexBuffer = vertexBufferAlloc(new Float32Array(MAX_SPRITES_PER_BATCH * FLOATS_PER_SPRITE));
                }
                device.queue.writeBuffer(vertexBuffer, 0, batch.vertices);
                usedVertexBuffers.push(vertexBuffer);

                const textureBindGroup = textureBindGroups.get(batch.texture);
                if (!textureBindGroup) {
                    throw new Error('Texture bind group not found!');
                }

                passEncoder.setPipeline(pipeline);
                passEncoder.setIndexBuffer(indexBuffer, 'uint16');
                passEncoder.setVertexBuffer(0, vertexBuffer);
                passEncoder.setBindGroup(0, projectionViewMatrixBindGroup);
                passEncoder.setBindGroup(1, textureBindGroup);
                passEncoder.drawIndexed(6 * batch.instances);
            }
        }

        passEncoder.end();

        device.queue.submit([commandEncoder.finish()]);

        for (const vertexBuffer of usedVertexBuffers) {
            vertexBuffers.push(vertexBuffer);
        }
    };
}