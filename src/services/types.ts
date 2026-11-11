import type { Localized } from '../lib/lang'

export type RequestStatus = 'new' | 'quoting' | 'awaiting_payment' | 'in_progress' | 'review' | 'completed' | 'cancelled'

/** المراحل بالترتيب (الإلغاء خارجها) */
export const STAGES: RequestStatus[] = ['new', 'quoting', 'awaiting_payment', 'in_progress', 'review', 'completed']

export interface ServiceType {
  id: string
  slug: string
  name: Localized
  description: Localized
  icon: 'GraduationCap' | 'MessagesSquare' | 'Map' | 'Layers' | 'Ruler' | 'FileCog'
  pricing: 'fixed' | 'custom'
  price: number | null
  unit: Localized | null
  requiresLocation: boolean
  isAcademic: boolean
  /** false للدعم الفني: يُغلق الطلب دون ملفات نهائية */
  requiresDeliverable: boolean
}

export interface RequestFile {
  id: string
  kind: 'input' | 'deliverable'
  name: string
  sizeBytes: number | null
  url: string
  uploadedBy: string
  createdAt: string
}

export interface RequestMessage {
  id: string
  senderId: string
  senderName: string
  senderIsStaff: boolean
  body: string
  isInternal: boolean
  createdAt: string
}

export interface RequestEvent {
  id: string
  type: 'status' | 'price' | 'assign'
  from: string | null
  to: string | null
  actorName: string | null
  createdAt: string
}

export interface RequestSummary {
  id: string
  number: number
  title: string
  serviceType: ServiceType
  status: RequestStatus
  price: number | null
  dueDate: string | null
  clientName: string
  assignedTo: string | null
  assignedName: string | null
  createdAt: string
  updatedAt: string
}

export interface RequestDetail extends RequestSummary {
  clientId: string
  description: string
  location: { lat: number; lng: number } | null
  locationNote: string | null
  files: RequestFile[]
  messages: RequestMessage[]
  events: RequestEvent[]
}

export interface NewRequestInput {
  serviceTypeId: string
  title: string
  description: string
  location: { lat: number; lng: number } | null
  locationNote: string
  dueDate: string | null
  academicPledge: boolean
  files: File[]
}

export interface TeamMember {
  id: string
  name: string
}

/** الخطوات التالية المتاحة لكل دور (مطابقة لقواعد request_transition على الخادم) */
export function allowedTransitions(
  status: RequestStatus,
  as: 'admin' | 'team' | 'client',
): RequestStatus[] {
  if (as === 'admin') {
    const next: Record<RequestStatus, RequestStatus[]> = {
      new: ['quoting', 'awaiting_payment', 'cancelled'],
      quoting: ['awaiting_payment', 'cancelled'],
      awaiting_payment: ['in_progress', 'quoting', 'cancelled'],
      in_progress: ['review', 'cancelled'],
      review: ['completed', 'in_progress'],
      completed: [],
      cancelled: ['new'],
    }
    return next[status]
  }
  if (as === 'team') return status === 'in_progress' ? ['review'] : []
  if (['new', 'quoting', 'awaiting_payment'].includes(status)) return ['cancelled']
  if (status === 'review') return ['completed', 'in_progress']
  return []
}

export const ACCEPTED_FILES =
  '.zip,.shp,.shx,.dbf,.prj,.cpg,.kml,.kmz,.geojson,.json,.gpkg,.dwg,.dxf,.pdf,.png,.jpg,.jpeg,.tif,.tiff,.csv,.xlsx,.xls,.docx'
export const MAX_FILE_MB = 50
