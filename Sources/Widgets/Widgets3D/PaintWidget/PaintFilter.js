import macro from 'vtk.js/Sources/macro';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';

const { vtkErrorMacro } = macro;

const PointType = {
  World: 0,
  Index: 1,
};

// ----------------------------------------------------------------------------
// vtkPaintFilter methods
// ----------------------------------------------------------------------------

function vtkPaintFilter(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkPaintFilter');

  model.points = [];
  model.pointType = PointType.Index;

  // --------------------------------------------------------------------------

  publicAPI.paintWorldPoints = (worldPoints) => {
    model.points = worldPoints;
    model.pointType = PointType.World;
    publicAPI.modified();
  };

  // --------------------------------------------------------------------------

  // Expects integer indices
  publicAPI.paintIndexPoints = (indexPoints) => {
    model.points = indexPoints;
    model.pointType = PointType.Index;
    publicAPI.modified();
  };

  // --------------------------------------------------------------------------

  publicAPI.requestData = (inData, outData) => {
    if (!model.backgroundImage) {
      vtkErrorMacro('No background image');
      return;
    }

    if (!model.backgroundImage.getPointData().getScalars()) {
      vtkErrorMacro('Background image has no scalars');
      return;
    }

    if (!model.maskImage) {
      // copy background image to blank mask image
      model.maskImage = vtkImageData.newInstance(
        model.backgroundImage.get('spacing', 'origin', 'direction')
      );
      model.maskImage.setDimensions(model.backgroundImage.getDimensions());

      const pd = model.backgroundImage.getPointData();
      const scalarsData = pd.getScalars().getData();
      const values = new scalarsData.constructor(
        model.backgroundImage.getNumberOfPoints()
      );
      const dataArray = vtkDataArray.newInstance({
        numberOfComponents: pd.getNumberOfComponents(),
        values,
      });
      model.maskImage.getPointData().setScalars(dataArray);
    }

    const scalars = model.maskImage.getPointData().getScalars();

    if (!scalars) {
      vtkErrorMacro('Mask image has no scalars');
      return;
    }

    // transform world points into index space
    if (model.pointType === PointType.World) {
      model.points = model.points.map((pt) => {
        const indexPt = [0, 0, 0];
        model.backgroundImage.worldToIndexVec3(pt, indexPt);
        return [
          Math.round(indexPt[0]),
          Math.round(indexPt[1]),
          Math.round(indexPt[2]),
        ];
      });
    }

    const spacing = model.maskImage.getSpacing();
    const dims = model.maskImage.getDimensions();
    const numberOfComponents = scalars.getNumberOfComponents();
    const jStride = numberOfComponents * dims[0];
    const kStride = numberOfComponents * dims[0] * dims[1];
    const scalarsData = scalars.getData();

    const [rx, ry, rz] = spacing.map((s) => model.radius / s);
    for (let pti = 0; pti < model.points.length; pti++) {
      const [x, y, z] = model.points[pti];
      const xstart = Math.floor(Math.min(dims[0] - 1, Math.max(0, x - rx)));
      const xend = Math.floor(Math.min(dims[0] - 1, Math.max(0, x + rx)));
      const ystart = Math.floor(Math.min(dims[1] - 1, Math.max(0, y - ry)));
      const yend = Math.floor(Math.min(dims[1] - 1, Math.max(0, y + ry)));
      const zstart = Math.floor(Math.min(dims[2] - 1, Math.max(0, z - rz)));
      const zend = Math.floor(Math.min(dims[2] - 1, Math.max(0, z + rz)));

      // naive algo
      for (let i = xstart; i <= xend; i++) {
        for (let j = ystart; j <= yend; j++) {
          for (let k = zstart; k <= zend; k++) {
            const ival = (i - x) / rx;
            const jval = (j - y) / ry;
            const kval = (k - z) / rz;
            if (ival * ival + jval * jval + kval * kval <= 1) {
              scalarsData.set(model.color, i + j * jStride + k * kStride);
            }
          }
        }
      }
    }

    scalars.setData(scalarsData);
    scalars.modified();
    model.maskImage.modified();

    // clear points without triggering requestData
    model.points = [];
    outData[0] = model.maskImage;
  };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  backgroundImage: null,
  maskImage: null,
  radius: 1,
  color: [1],
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  // Make this a VTK object
  macro.obj(publicAPI, model);

  // Also make it an algorithm with no model.backgroundImages and one output
  macro.algo(publicAPI, model, 0, 1);

  macro.setGet(publicAPI, model, [
    'backgroundImage',
    'maskImage',
    'color',
    'radius',
  ]);

  // Object specific methods
  vtkPaintFilter(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, 'vtkPaintFilter');

// ----------------------------------------------------------------------------

export default { newInstance, extend };
