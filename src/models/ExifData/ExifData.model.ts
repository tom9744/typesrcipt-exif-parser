import {
  EXIFPrivateTag,
  GPSInfoTag,
  IFDTIFFTag,
  IFD_EXIF_TAG_NAME_BY_TAG_ID,
  IFD_GPS_TAG_NAME_BY_TAG_ID,
  IFD_TIFF_TAG_NAME_BY_TAG_ID,
} from "../../constants/tags";
import { isNumberArray, readDataViewAsString } from "../../utils";
import { IFD0 } from "./ImageFileDirectory/IFD0.model";
import { EntryData, IIFDEntryModel } from "./ImageFileDirectory/IFDEntryFactory";
import { ImageFileDirectory } from "./ImageFileDirectory/ImageFileDirectory.model";

enum ByteAlign {
  BigEndian = 0x4d4d,
  LittleEndian = 0x4949,
}

enum TagMark {
  BigEndian = 0x002a,
  LittleEndian = 0x2a00,
}

type IFDEntrySummary = { [key in IFDTIFFTag]?: EntryData };
type EXIFEntrySummary = { [key in EXIFPrivateTag]?: EntryData };
type GPSEntrySummary = { [key in GPSInfoTag]?: EntryData };

/**
 * Reference: https://nightohl.tistory.com/entry/EXIF-Format
 */
export class ExifData {
  private _isLittle = true;
  private _IFD0: IFD0 | null = null;
  private _IFD1: ImageFileDirectory | null = null;
  private _EXIF: ImageFileDirectory | null = null;
  private _GPS: ImageFileDirectory | null = null;

  get IFD0(): IFDEntrySummary | null {
    if (!this._IFD0?.entries) {
      return null;
    }
    return this.formatIFDEntries(this._IFD0.entries);
  }

  get IFD1(): IFDEntrySummary | null {
    if (!this._IFD1?.entries) {
      return null;
    }
    return this.formatIFDEntries(this._IFD1.entries);
  }

  get EXIF(): EXIFEntrySummary | null {
    if (!this._EXIF?.entries) {
      return null;
    }
    return this.formatEXIFEntries(this._EXIF.entries);
  }

  get GPS(): GPSEntrySummary | null {
    if (!this._GPS?.entries) {
      return null;
    }
    return this.formatGPSEntries(this._GPS.entries);
  }

  constructor(arrayBuffer: ArrayBuffer, offset: number, length: number) {
    const dataView = new DataView(arrayBuffer.slice(offset, offset + length));

    this.initialize(dataView);

    const offsetToIFD0 = dataView.getUint32(14, this._isLittle);
    this._IFD0 = new IFD0(dataView, offsetToIFD0, this._isLittle);

    if (this._IFD0.offsetToIFD1 > 0) {
      this._IFD1 = new ImageFileDirectory(dataView, this._IFD0.offsetToIFD1, this._isLittle);
    }

    if (this._IFD0.offsetToEXIF && this._IFD0.offsetToEXIF > 0) {
      this._EXIF = new ImageFileDirectory(dataView, this._IFD0.offsetToEXIF, this._isLittle);
    }

    if (this._IFD0.offsetToGPS && this._IFD0.offsetToGPS > 0) {
      this._GPS = new ImageFileDirectory(dataView, this._IFD0.offsetToGPS, this._isLittle);
    }
  }

  private initialize(dataView: DataView): void {
    const exifHeader = readDataViewAsString(dataView, 4, 6);
    const byteAlign = dataView.getUint16(10);
    const tagMark = dataView.getUint16(12, this._isLittle);

    const checkExifHeader = (): void => {
      if (exifHeader !== "Exif\0\0") {
        throw new Error(`Invalid EXIF Header! Expected 'Exif\\0\\0', but got '${exifHeader}'.`);
      }
    };

    const checkByteAlign = (): void => {
      if (byteAlign !== ByteAlign.BigEndian && byteAlign !== ByteAlign.LittleEndian) {
        throw new Error(`Invalid Byte Align! Expected ${ByteAlign.BigEndian} or ${ByteAlign.LittleEndian}, but got ${byteAlign}.`);
      }

      this._isLittle = byteAlign === ByteAlign.LittleEndian;
    };

    const checkTagMark = (): void => {
      if (tagMark !== TagMark.BigEndian && tagMark !== TagMark.LittleEndian) {
        throw new Error(`Invalid Tag Mark! Expected ${TagMark.BigEndian} or ${TagMark.LittleEndian}, but got ${tagMark}.`);
      }
    };

    // IMPORTANT: 실행 순서가 변경되면 안됩니다.
    checkExifHeader();
    checkByteAlign();
    checkTagMark();
  }

  private formatIFDEntries(entries: IIFDEntryModel[]): IFDEntrySummary {
    return entries.reduce((acc, entry) => {
      const tagName = IFD_TIFF_TAG_NAME_BY_TAG_ID[entry.tag];

      if (!tagName) {
        return acc;
      }

      // TODO: 각 태그 별 데이터 포매팅
      acc[tagName] = entry.data;

      return acc;
    }, {} as IFDEntrySummary);
  }

  private formatEXIFEntries(entries: IIFDEntryModel[]): EXIFEntrySummary {
    return entries.reduce((acc, entry) => {
      const tagName = IFD_EXIF_TAG_NAME_BY_TAG_ID[entry.tag];

      if (!tagName) {
        return acc;
      }

      // TODO: 각 태그 별 데이터 포매팅
      acc[tagName] = entry.data;

      return acc;
    }, {} as EXIFEntrySummary);
  }

  private formatGPSEntries(entries: IIFDEntryModel[]): GPSEntrySummary {
    return entries.reduce<GPSEntrySummary>((acc, { tag, data }) => {
      const tagName = IFD_GPS_TAG_NAME_BY_TAG_ID[tag];

      if (!tagName) {
        return acc;
      }

      switch (tagName) {
        case "GPSTimeStamp":
          if (!isNumberArray(data)) {
            break;
          }
          const timeStamp = data.map((value) => (value < 10 ? `0${value}` : `${value}`)).join(":");
          acc[tagName] = timeStamp;
          break;
        case "GPSLongitude":
        case "GPSDestLongitude":
        case "GPSLatitude":
        case "GPSDestLatitude":
          if (!isNumberArray(data)) {
            break;
          }
          const [degree, minutes, seconds] = [...data];
          acc[tagName] = degree + minutes / 60 + seconds / 3600;
          break;
        default:
          acc[tagName] = data;
          break;
      }

      return acc;
    }, {});
  }
}
