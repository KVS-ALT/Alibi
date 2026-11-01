// Provider fixtures contain data only; trusted local HTML is rendered after validation.
function modelShape(output){
 const candidate=structuredClone({claims:output.claims,portfolio:output.portfolio});
 for(const project of Object.values(candidate.portfolio.projects))delete project.mockHtml;
 return candidate;
}
module.exports={modelShape};
