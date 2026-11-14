import { z } from 'zod';
export const attributeSchema=z.object({sku:z.string().min(1),category:z.string().min(1),fabric:z.string().min(1),color:z.string().min(1),gender:z.enum(['Men','Women','Unisex','Kids','Not applicable','Unspecified']),provenance:z.string().min(1)});
export type ProductAttributes=z.infer<typeof attributeSchema>;
export type CatalogFilters={search:string;category:string;fabric:string;color:string;gender:string;band:string;unit:string};
export const emptyFilters:CatalogFilters={search:'',category:'All',fabric:'All',color:'All',gender:'All',band:'All',unit:'All'};
export function attributesFor(sku:string,attributes:ProductAttributes[]):ProductAttributes {
 return attributes.find(a=>a.sku===sku)??{sku,category:'Unspecified',fabric:'Unspecified',color:'Unspecified',gender:'Unspecified',provenance:'Not classified'};
}
export function filterInventory<T extends {sku:string;name:string;unit:string;quantityBand:string}>(items:T[],attributes:ProductAttributes[],filters:CatalogFilters):T[] {
 return items.filter(item=>{
  const a=attributesFor(item.sku,attributes);
  return `${item.name} ${item.sku} ${a.fabric} ${a.color}`.toLowerCase().includes(filters.search.toLowerCase())&&
   (filters.category==='All'||filters.category===a.category)&&(filters.fabric==='All'||filters.fabric===a.fabric)&&
   (filters.color==='All'||filters.color===a.color)&&(filters.gender==='All'||filters.gender===a.gender)&&
   (filters.band==='All'||filters.band===item.quantityBand)&&(filters.unit==='All'||filters.unit===item.unit);
 });
}
